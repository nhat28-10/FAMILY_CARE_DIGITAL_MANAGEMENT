import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { UploadedFilePayload } from '../storage/storage.service';

export interface FaceEmbeddingExtractResult {
  faceCount: number;
  embedding: number[];
  embeddingDimension: number;
  detectionScore: number;
  qualityScore?: number | null;
  modelName: string;
  modelVersion: string;
}

export interface FaceDetectionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  faceIndex: number;
  boundingBox: FaceDetectionBoundingBox;
  embedding: number[];
  embeddingDimension: number;
  detectionScore: number;
  qualityScore?: number | null;
}

export interface FaceDetectionResponse {
  faces: FaceDetectionResult[];
  modelName: string;
  modelVersion: string;
}

@Injectable()
export class FaceAiClientService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('faceAi.baseUrl', 'http://face-ai-service:8000')
      .replace(/\/+$/, '');
    this.timeoutMs = config.get<number>('faceAi.timeoutMs', 30000);
  }

  async extractEmbedding(
    file: UploadedFilePayload,
  ): Promise<FaceEmbeddingExtractResult> {
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer.length);
    bytes.set(file.buffer);
    form.append(
      'image',
      new Blob([bytes], { type: file.mimetype }),
      file.originalname,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `${this.baseUrl}/v1/face-embeddings/extract`,
        {
          method: 'POST',
          body: form,
          signal: controller.signal,
        },
      );
      const body = await this.parseJson(response);
      if (!response.ok) {
        if (response.status === 400 || response.status === 422) {
          throw new BadRequestException('Face image is not enrollable');
        }
        throw new ServiceUnavailableException('Face AI service failed');
      }
      return this.parseResult(body);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || controller.signal.aborted);
      throw new ServiceUnavailableException(
        timedOut
          ? 'Face AI service timeout'
          : 'Cannot connect to Face AI service',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async detectFaces(file: UploadedFilePayload): Promise<FaceDetectionResponse> {
    const form = this.toFormData(file);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/faces/detect`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      const body = await this.parseJson(response);
      if (!response.ok) {
        if (response.status === 400 || response.status === 422) {
          throw new BadRequestException('Face image cannot be scanned');
        }
        throw new ServiceUnavailableException('Face AI service failed');
      }
      return this.parseDetectionResponse(body);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || controller.signal.aborted);
      throw new ServiceUnavailableException(
        timedOut
          ? 'Face AI service timeout'
          : 'Cannot connect to Face AI service',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private toFormData(file: UploadedFilePayload): FormData {
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer.length);
    bytes.set(file.buffer);
    form.append(
      'image',
      new Blob([bytes], { type: file.mimetype }),
      file.originalname,
    );
    return form;
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      const body: unknown = await response.json();
      return body;
    } catch {
      throw new ServiceUnavailableException('Face AI returned invalid JSON');
    }
  }

  private parseResult(value: unknown): FaceEmbeddingExtractResult {
    if (!this.isRecord(value)) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    const embedding = value.embedding;
    if (
      typeof value.faceCount !== 'number' ||
      !this.isNumberArray(embedding) ||
      typeof value.embeddingDimension !== 'number' ||
      typeof value.detectionScore !== 'number' ||
      typeof value.modelName !== 'string' ||
      typeof value.modelVersion !== 'string'
    ) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    return {
      faceCount: value.faceCount,
      embedding,
      embeddingDimension: value.embeddingDimension,
      detectionScore: value.detectionScore,
      qualityScore:
        typeof value.qualityScore === 'number' ? value.qualityScore : null,
      modelName: value.modelName,
      modelVersion: value.modelVersion,
    };
  }

  private parseDetectionResponse(value: unknown): FaceDetectionResponse {
    if (!this.isRecord(value)) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    const facesValue = value.faces;
    if (!Array.isArray(facesValue)) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    if (
      typeof value.modelName !== 'string' ||
      typeof value.modelVersion !== 'string'
    ) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    const faces = facesValue.map((face: unknown) => this.parseDetection(face));
    return {
      faces,
      modelName: value.modelName,
      modelVersion: value.modelVersion,
    };
  }

  private parseDetection(value: unknown): FaceDetectionResult {
    if (!this.isRecord(value)) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    const embedding = value.embedding;
    const box = value.boundingBox;
    if (
      typeof value.faceIndex !== 'number' ||
      !this.isNormalizedBox(box) ||
      !this.isNumberArray(embedding) ||
      typeof value.embeddingDimension !== 'number' ||
      embedding.length !== value.embeddingDimension ||
      typeof value.detectionScore !== 'number'
    ) {
      throw new ServiceUnavailableException('Face AI response is invalid');
    }
    return {
      faceIndex: value.faceIndex,
      boundingBox: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      embedding,
      embeddingDimension: value.embeddingDimension,
      detectionScore: value.detectionScore,
      qualityScore:
        typeof value.qualityScore === 'number' ? value.qualityScore : null,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isNumberArray(value: unknown): value is number[] {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'number' && Number.isFinite(item))
    );
  }

  private isNormalizedBox(value: unknown): value is FaceDetectionBoundingBox {
    if (!this.isRecord(value)) return false;
    const { x, y, width, height } = value;
    return (
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof width === 'number' &&
      typeof height === 'number' &&
      [x, y, width, height].every(
        (item) => Number.isFinite(item) && item >= 0 && item <= 1,
      ) &&
      x + width <= 1.000001 &&
      y + height <= 1.000001
    );
  }
}
