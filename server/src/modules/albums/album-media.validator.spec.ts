import { BadRequestException } from '@nestjs/common';
import { AlbumMediaType } from '@prisma/client';

import type { UploadedFilePayload } from '../storage/storage.service';
import { validateAlbumFile } from './album-media.validator';

function file(
  mimetype: string,
  buffer: Buffer,
  size = buffer.length,
): UploadedFilePayload {
  return { originalname: 'media.bin', mimetype, buffer, size };
}

describe('validateAlbumFile', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    [
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
  ])('accepts valid %s signature', (mimetype, buffer) => {
    expect(validateAlbumFile(file(mimetype, buffer)).mediaType).toBe(
      AlbumMediaType.PHOTO,
    );
  });

  it('accepts valid MP4 signature', () => {
    expect(
      validateAlbumFile(file('video/mp4', Buffer.from('0000ftyp0000')))
        .mediaType,
    ).toBe(AlbumMediaType.VIDEO);
  });

  it('rejects a declared MIME that does not match magic bytes', () => {
    expect(() =>
      validateAlbumFile(
        file('image/png', Buffer.from([0xff, 0xd8, 0xff, 0x00])),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported MIME', () => {
    expect(() =>
      validateAlbumFile(file('image/gif', Buffer.from('GIF89a'))),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid magic bytes', () => {
    expect(() =>
      validateAlbumFile(file('image/jpeg', Buffer.from('not-an-image'))),
    ).toThrow(BadRequestException);
  });

  it('rejects photos larger than 10MB', () => {
    expect(() =>
      validateAlbumFile(
        file(
          'image/jpeg',
          Buffer.from([0xff, 0xd8, 0xff]),
          10 * 1024 * 1024 + 1,
        ),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects videos larger than 20MB', () => {
    expect(() =>
      validateAlbumFile(
        file('video/mp4', Buffer.from('0000ftyp0000'), 20 * 1024 * 1024 + 1),
      ),
    ).toThrow(BadRequestException);
  });
});
