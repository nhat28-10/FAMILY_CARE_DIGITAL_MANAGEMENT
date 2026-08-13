import os
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MODEL_NAME = os.getenv("FACE_AI_MODEL_NAME", "buffalo_l")
MODEL_VERSION = os.getenv("FACE_AI_MODEL_VERSION", MODEL_NAME)
DETECTION_SIZE = int(os.getenv("FACE_AI_DETECTION_SIZE", "640"))
DEVICE = os.getenv("FACE_AI_DEVICE", "cpu")
MAX_FACES = max(1, int(os.getenv("FACE_SCAN_MAX_FACES", "20")))


class FaceModel(Protocol):
    def extract(self, image_bytes: bytes) -> dict:
        ...

    def detect(self, image_bytes: bytes) -> dict:
        ...


@dataclass
class InsightFaceModel:
    model_name: str
    detection_size: int
    device: str

    def __post_init__(self) -> None:
        from insightface.app import FaceAnalysis

        providers = ["CPUExecutionProvider"]
        ctx_id = -1 if self.device.lower() == "cpu" else 0
        self.app = FaceAnalysis(name=self.model_name, providers=providers)
        self.app.prepare(
            ctx_id=ctx_id, det_size=(self.detection_size, self.detection_size)
        )

    def extract(self, image_bytes: bytes) -> dict:
        image = self._decode(image_bytes)
        faces = self.app.get(image)
        face_count = len(faces)
        if face_count != 1:
            raise HTTPException(
                status_code=422,
                detail="Image must contain exactly one face",
            )

        face = faces[0]
        embedding = self._normalized_embedding(face)
        detection_score = float(getattr(face, "det_score", 0.0))

        return {
            "faceCount": 1,
            "embedding": embedding.astype(float).tolist(),
            "embeddingDimension": int(embedding.shape[0]),
            "detectionScore": max(0.0, min(1.0, detection_score)),
            "qualityScore": max(0.0, min(1.0, detection_score)),
            "modelName": self.model_name,
            "modelVersion": MODEL_VERSION,
        }

    def detect(self, image_bytes: bytes) -> dict:
        image = self._decode(image_bytes)
        image_height, image_width = image.shape[:2]
        faces = sorted(
            self.app.get(image),
            key=lambda item: float(getattr(item, "det_score", 0.0)),
            reverse=True,
        )[:MAX_FACES]

        results = []
        for index, face in enumerate(faces):
            embedding = self._normalized_embedding(face)
            x1, y1, x2, y2 = np.asarray(face.bbox, dtype=np.float32).tolist()
            x1 = max(0.0, min(float(image_width), x1))
            x2 = max(0.0, min(float(image_width), x2))
            y1 = max(0.0, min(float(image_height), y1))
            y2 = max(0.0, min(float(image_height), y2))
            detection_score = float(getattr(face, "det_score", 0.0))
            results.append(
                {
                    "faceIndex": index,
                    "boundingBox": {
                        "x": x1 / image_width,
                        "y": y1 / image_height,
                        "width": max(0.0, x2 - x1) / image_width,
                        "height": max(0.0, y2 - y1) / image_height,
                    },
                    "embedding": embedding.astype(float).tolist(),
                    "embeddingDimension": int(embedding.shape[0]),
                    "detectionScore": max(0.0, min(1.0, detection_score)),
                    "qualityScore": max(0.0, min(1.0, detection_score)),
                }
            )

        return {
            "faces": results,
            "modelName": self.model_name,
            "modelVersion": MODEL_VERSION,
        }

    def _decode(self, image_bytes: bytes) -> Any:
        import cv2

        data = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(status_code=422, detail="Invalid image")
        return image

    def _normalized_embedding(self, face: Any) -> np.ndarray:
        embedding = np.asarray(face.normed_embedding, dtype=np.float32)
        norm = np.linalg.norm(embedding)
        if norm == 0:
            raise HTTPException(status_code=422, detail="Invalid face embedding")
        return embedding / norm


app = FastAPI(title="Family Care Face AI Service")


def get_model() -> FaceModel:
    model = getattr(app.state, "face_model", None)
    if model is None:
        model = InsightFaceModel(MODEL_NAME, DETECTION_SIZE, DEVICE)
        app.state.face_model = model
    return model


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "modelName": MODEL_NAME, "device": DEVICE}


@app.post("/v1/face-embeddings/extract")
async def extract_face_embedding(image: UploadFile = File(...)) -> dict:
    image_bytes = await read_image_upload(image)
    model = get_model()
    return await run_in_threadpool(model.extract, image_bytes)


@app.post("/v1/faces/detect")
async def detect_faces(image: UploadFile = File(...)) -> dict:
    image_bytes = await read_image_upload(image)
    model = get_model()
    return await run_in_threadpool(model.detect, image_bytes)


async def read_image_upload(image: UploadFile) -> bytes:
    content_type = image.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    try:
        image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Image exceeds 5MB")
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Image is empty")
        return image_bytes
    finally:
        await image.close()
