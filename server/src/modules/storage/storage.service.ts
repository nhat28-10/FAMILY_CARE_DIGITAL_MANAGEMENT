import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.r2Bucket') ?? '';
    this.publicUrl = (config.get<string>('storage.r2PublicUrl') ?? '').replace(
      /\/+$/,
      '',
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
        `Upload R2 thất bại (${key}): ${(err as Error).message}`,
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
        `Xóa file R2 thất bại (${key}): ${(err as Error).message}`,
      );
    }
  }
}
