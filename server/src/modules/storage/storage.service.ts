import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';

/** File nhận từ multer (FileInterceptor memory storage). */
export interface UploadedFilePayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Ràng buộc upload theo domain (chat-attachments, album-media, ...). */
export interface SaveFileOptions {
  /** mime → extension an toàn. File ngoài whitelist bị từ chối. */
  allowedMimeToExt: Record<string, string>;
  /** Dung lượng tối đa (bytes). */
  maxSize: number;
}

export interface SavedFileResult {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SavedPrivateFileResult {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface DownloadedPrivateFile {
  buffer: Buffer;
  contentType?: string;
  contentLength?: number;
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy object trong R2');
    this.name = 'StorageObjectNotFoundError';
  }
}

export function sanitizeStorageError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'Lỗi lưu trữ không xác định';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&](?:X-Amz-[^=]+|token|signature|credential)=)[^&\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(?:api[_-]?key|secret|token)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .slice(0, 1000);
}

/**
 * Lưu trữ file dùng chung (Cloudflare R2 — S3-compatible). DB chỉ lưu URL nên
 * đổi nhà cung cấp (S3/B2) chỉ cần đổi ENV `R2_*`, không sửa code gọi.
 * Chat dùng domain `chat-attachments`; album sau này dùng `album-media`.
 * (Task-proofs cũ vẫn lưu local `uploads/` — TODO migrate sang service này sau.)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.r2Bucket') ?? '';
    this.publicUrl = (config.get<string>('storage.r2PublicUrl') ?? '').replace(
      /\/+$/,
      '',
    );
    this.signedUrlTtlSeconds = config.get<number>(
      'storage.signedUrlTtlSeconds',
      600,
    );
    this.client = new S3Client({
      // R2 chỉ có 1 region logic là 'auto'.
      region: 'auto',
      endpoint: config.get<string>('storage.r2Endpoint') || undefined,
      credentials: {
        accessKeyId: config.get<string>('storage.r2AccessKeyId') ?? '',
        secretAccessKey: config.get<string>('storage.r2SecretAccessKey') ?? '',
      },
    });
  }

  /** Upload file lên R2 theo key `<domain>/<familyId>/<uuid><ext>` → trả URL public. */
  async saveFile(
    domain: string,
    familyId: string,
    file: UploadedFilePayload | undefined,
    options: SaveFileOptions,
  ): Promise<SavedFileResult> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên');
    }
    if (file.size > options.maxSize) {
      throw new BadRequestException(
        `Dung lượng file không được vượt quá ${Math.floor(options.maxSize / (1024 * 1024))}MB`,
      );
    }
    if (!Object.hasOwn(options.allowedMimeToExt, file.mimetype)) {
      throw new BadRequestException('Định dạng file không được hỗ trợ');
    }
    const extension =
      options.allowedMimeToExt[file.mimetype] ||
      extname(file.originalname).toLowerCase();

    const key = `${domain}/${familyId}/${randomUUID()}${extension}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Upload R2 thất bại (${domain}): ${sanitizeStorageError(err)}`,
      );
      throw new ServiceUnavailableException(
        'Không thể tải file lên hệ thống lưu trữ, vui lòng thử lại',
      );
    }

    return {
      fileUrl: `${this.publicUrl}/${key}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** Upload private object and return only its storage key (never a public URL). */
  async savePrivateFile(
    domain: string,
    familyId: string,
    file: UploadedFilePayload | undefined,
    options: SaveFileOptions,
  ): Promise<SavedPrivateFileResult> {
    const prepared = this.prepareFile(file, options);
    const key = `${domain}/${familyId}/${randomUUID()}${prepared.extension}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: prepared.file.buffer,
          ContentType: prepared.file.mimetype,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Upload private object R2 thất bại (${domain}): ${sanitizeStorageError(err)}`,
      );
      throw new ServiceUnavailableException(
        'Không thể tải file lên hệ thống lưu trữ, vui lòng thử lại',
      );
    }

    return {
      storageKey: key,
      fileName: prepared.file.originalname,
      mimeType: prepared.file.mimetype,
      size: prepared.file.size,
    };
  }

  /** Create a short-lived GET URL for a private object. */
  async createSignedReadUrl(
    storageKey: string,
    expiresInSeconds = this.signedUrlTtlSeconds,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
        { expiresIn: expiresInSeconds },
      );
    } catch (err) {
      this.logger.error(
        `Không thể tạo signed URL cho object R2: ${sanitizeStorageError(err)}`,
      );
      throw new ServiceUnavailableException(
        'Không thể tạo quyền truy cập file, vui lòng thử lại',
      );
    }
  }

  async createSignedReadUrlFromStoredUrl(
    fileUrl: string | null | undefined,
    expiresInSeconds = this.signedUrlTtlSeconds,
  ): Promise<string | null> {
    const storageKey = this.extractStorageKeyFromUrl(fileUrl);
    return storageKey
      ? this.createSignedReadUrl(storageKey, expiresInSeconds)
      : null;
  }

  extractStorageKeyFromUrl(fileUrl: string | null | undefined): string | null {
    if (!fileUrl || fileUrl.startsWith('/')) {
      return null;
    }

    if (this.publicUrl && fileUrl.startsWith(`${this.publicUrl}/`)) {
      return this.stripQuery(fileUrl.slice(this.publicUrl.length + 1));
    }

    try {
      const url = new URL(fileUrl);
      const isSignedUrl =
        url.searchParams.has('X-Amz-Signature') ||
        url.searchParams.has('X-Amz-Credential') ||
        url.searchParams.has('X-Amz-Algorithm');
      if (!isSignedUrl) {
        return null;
      }

      const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!path) {
        return null;
      }

      return this.bucket && path.startsWith(`${this.bucket}/`)
        ? path.slice(this.bucket.length + 1)
        : path;
    } catch {
      return null;
    }
  }

  private stripQuery(value: string): string {
    return value.split('?')[0];
  }

  /** Delete directly by storage key, optionally propagating R2 failures. */
  async deleteFileByKey(
    storageKey: string,
    throwOnError = false,
  ): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return true;
    } catch (err) {
      if (
        (err as { name?: string }).name === 'NoSuchKey' ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return true;
      }
      const message = `Xóa object R2 thất bại: ${sanitizeStorageError(err)}`;
      if (throwOnError) {
        this.logger.error(message);
        throw new ServiceUnavailableException(
          'Không thể xóa file khỏi hệ thống lưu trữ, vui lòng thử lại',
        );
      }
      this.logger.warn(message);
      return false;
    }
  }

  /** Download a private object for trusted backend processing. */
  async downloadFileByKey(storageKey: string): Promise<DownloadedPrivateFile> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      if (!response.Body) {
        throw new StorageObjectNotFoundError();
      }
      const bytes = await response.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (err) {
      if (
        err instanceof StorageObjectNotFoundError ||
        (err as { name?: string }).name === 'NoSuchKey' ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        throw new StorageObjectNotFoundError();
      }
      this.logger.error(
        `Download object R2 thất bại: ${sanitizeStorageError(err)}`,
      );
      throw new ServiceUnavailableException(
        'Không thể đọc file từ hệ thống lưu trữ, vui lòng thử lại',
      );
    }
  }

  /** Xóa file theo URL đã lưu (best-effort — lỗi chỉ ghi log, không throw). */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!this.publicUrl || !fileUrl.startsWith(`${this.publicUrl}/`)) {
      return;
    }
    const key = fileUrl.slice(this.publicUrl.length + 1);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(
        `Xóa file R2 legacy thất bại: ${sanitizeStorageError(err)}`,
      );
    }
  }

  private prepareFile(
    file: UploadedFilePayload | undefined,
    options: SaveFileOptions,
  ): { file: UploadedFilePayload; extension: string } {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên');
    }
    if (file.size > options.maxSize) {
      throw new BadRequestException(
        `Dung lượng file không được vượt quá ${Math.floor(options.maxSize / (1024 * 1024))}MB`,
      );
    }
    if (!Object.hasOwn(options.allowedMimeToExt, file.mimetype)) {
      throw new BadRequestException('Định dạng file không được hỗ trợ');
    }
    return {
      file,
      extension:
        options.allowedMimeToExt[file.mimetype] ||
        extname(file.originalname).toLowerCase(),
    };
  }
}
