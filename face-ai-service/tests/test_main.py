from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import MAX_FACES, app


class FakeFaceModel:
    def __init__(self, mode: str):
        self.mode = mode

    def extract(self, image_bytes: bytes) -> dict:
        if self.mode in {"none", "multi"}:
            raise HTTPException(
                status_code=422, detail="Image must contain exactly one face"
            )
        return {
            "faceCount": 1,
            "embedding": [1.0, 0.0, 0.0],
            "embeddingDimension": 3,
            "detectionScore": 0.99,
            "qualityScore": 0.9,
            "modelName": "mock",
            "modelVersion": "mock-v1",
        }

    def detect(self, image_bytes: bytes) -> dict:
        if self.mode == "none":
            faces = []
        elif self.mode == "many":
            faces = [self._face(index) for index in range(MAX_FACES + 5)]
        else:
            count = 2 if self.mode == "multi" else 1
            faces = [self._face(index) for index in range(count)]
        return {"faces": faces[:MAX_FACES], "modelName": "mock", "modelVersion": "mock-v1"}

    def _face(self, index: int) -> dict:
        return {
            "faceIndex": index,
            "boundingBox": {
                "x": 0.1,
                "y": 0.2,
                "width": 0.3,
                "height": 0.4,
            },
            "embedding": [1.0, 0.0, 0.0],
            "embeddingDimension": 3,
            "detectionScore": 0.99,
            "qualityScore": 0.9,
        }


def client_with_model(mode: str) -> TestClient:
    app.state.face_model = FakeFaceModel(mode)
    return TestClient(app)


def test_health() -> None:
    client = client_with_model("single")
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_extract_single_face() -> None:
    client = client_with_model("single")
    response = client.post(
        "/v1/face-embeddings/extract",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["faceCount"] == 1
    assert body["embeddingDimension"] == 3
    assert body["embedding"] == [1.0, 0.0, 0.0]


def test_extract_no_face() -> None:
    client = client_with_model("none")
    response = client.post(
        "/v1/face-embeddings/extract",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 422


def test_extract_multi_face() -> None:
    client = client_with_model("multi")
    response = client.post(
        "/v1/face-embeddings/extract",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 422


def test_detect_no_face() -> None:
    client = client_with_model("none")
    response = client.post(
        "/v1/faces/detect",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["faces"] == []


def test_detect_single_face_with_normalized_box() -> None:
    client = client_with_model("single")
    response = client.post(
        "/v1/faces/detect",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 200
    face = response.json()["faces"][0]
    box = face["boundingBox"]
    assert all(0 <= box[key] <= 1 for key in ["x", "y", "width", "height"])
    assert box["x"] + box["width"] <= 1
    assert box["y"] + box["height"] <= 1
    assert face["embeddingDimension"] == 3


def test_detect_multiple_faces() -> None:
    client = client_with_model("multi")
    response = client.post(
        "/v1/faces/detect",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 200
    assert len(response.json()["faces"]) == 2


def test_detect_truncates_to_max_faces() -> None:
    client = client_with_model("many")
    response = client.post(
        "/v1/faces/detect",
        files={"image": ("face.png", b"fake-image", "image/png")},
    )
    assert response.status_code == 200
    assert len(response.json()["faces"]) == MAX_FACES
