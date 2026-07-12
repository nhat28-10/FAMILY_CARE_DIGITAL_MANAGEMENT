import { BadRequestException } from '@nestjs/common';
import { AlbumMediaType } from '@prisma/client';

import type { UploadedFilePayload } from '../storage/storage.service';

export const ALBUM_MAX_FILE_SIZE = 20 * 1024 * 1024;
export const ALBUM_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
};

const PHOTO_MAX_SIZE = 10 * 1024 * 1024;
const VIDEO_MAX_SIZE = 20 * 1024 * 1024;

export interface ValidatedAlbumFile {
  mediaType: AlbumMediaType;
  mimeType: string;
}

export function validateAlbumFile(
  file: UploadedFilePayload | undefined,
): ValidatedAlbumFile {
  if (!file) {
    throw new BadRequestException('Vui lòng chọn file để tải lên');
  }
  if (!Object.hasOwn(ALBUM_MIME_TO_EXT, file.mimetype)) {
    throw new BadRequestException('Định dạng file không được hỗ trợ');
  }

  const detectedMime = detectAlbumMime(file.buffer);
  if (!detectedMime || detectedMime !== file.mimetype) {
    throw new BadRequestException(
      'MIME khai báo không khớp với nội dung thực tế của file',
    );
  }

  const mediaType =
    detectedMime === 'video/mp4' ? AlbumMediaType.VIDEO : AlbumMediaType.PHOTO;
  const maxSize =
    mediaType === AlbumMediaType.PHOTO ? PHOTO_MAX_SIZE : VIDEO_MAX_SIZE;
  if (file.size > maxSize) {
    throw new BadRequestException(
      `Dung lượng ${mediaType === AlbumMediaType.PHOTO ? 'ảnh' : 'video'} không được vượt quá ${maxSize / (1024 * 1024)}MB`,
    );
  }

  return { mediaType, mimeType: detectedMime };
}

export function detectAlbumMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    return 'video/mp4';
  }
  return null;
}
