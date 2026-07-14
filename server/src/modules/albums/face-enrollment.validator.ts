import { BadRequestException } from '@nestjs/common';

import type { UploadedFilePayload } from '../storage/storage.service';
import { detectAlbumMime } from './album-media.validator';

export const FACE_ENROLLMENT_MIN_FILES = 3;
export const FACE_ENROLLMENT_MAX_FILES = 5;
export const FACE_ENROLLMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const FACE_ENROLLMENT_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function validateFaceEnrollmentFiles(
  files: UploadedFilePayload[] | undefined,
) {
  if (
    !files ||
    files.length < FACE_ENROLLMENT_MIN_FILES ||
    files.length > FACE_ENROLLMENT_MAX_FILES
  ) {
    throw new BadRequestException('Face enrollment requires 3 to 5 images');
  }

  for (const file of files) {
    if (!Object.hasOwn(FACE_ENROLLMENT_MIME_TO_EXT, file.mimetype)) {
      throw new BadRequestException('Unsupported face enrollment image type');
    }
    if (file.size > FACE_ENROLLMENT_MAX_FILE_SIZE) {
      throw new BadRequestException('Face enrollment image exceeds 5MB');
    }
    const detectedMime = detectAlbumMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException(
        'Declared MIME does not match face enrollment image content',
      );
    }
  }

  return files;
}
