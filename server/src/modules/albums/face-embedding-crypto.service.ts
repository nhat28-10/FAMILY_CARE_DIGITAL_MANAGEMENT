import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedEmbedding {
  encryptedEmbedding: Uint8Array<ArrayBuffer>;
  encryptionIv: Uint8Array<ArrayBuffer>;
  encryptionAuthTag: Uint8Array<ArrayBuffer>;
}

@Injectable()
export class FaceEmbeddingCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const rawKey = config.get<string>('faceEmbedding.encryptionKey', '');
    const key = Buffer.from(rawKey, 'base64');
    if (!rawKey || key.length !== 32) {
      throw new InternalServerErrorException(
        'FACE_EMBEDDING_ENCRYPTION_KEY must be base64 for exactly 32 bytes',
      );
    }
    this.key = key;
  }

  encryptEmbedding(embedding: number[]): EncryptedEmbedding {
    const plaintext = Buffer.alloc(embedding.length * 4);
    embedding.forEach((value, index) => {
      plaintext.writeFloatLE(value, index * 4);
    });

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      encryptedEmbedding: this.toBytes(encrypted),
      encryptionIv: this.toBytes(iv),
      encryptionAuthTag: this.toBytes(cipher.getAuthTag()),
    };
  }

  decryptEmbedding(
    encryptedEmbedding: Uint8Array | Buffer,
    encryptionIv: Uint8Array | Buffer,
    encryptionAuthTag: Uint8Array | Buffer,
    embeddingDimension: number,
  ): number[] {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encryptionIv),
    );
    decipher.setAuthTag(Buffer.from(encryptionAuthTag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedEmbedding)),
      decipher.final(),
    ]);
    if (plaintext.length !== embeddingDimension * 4) {
      throw new InternalServerErrorException(
        'Encrypted face embedding is invalid',
      );
    }
    const embedding: number[] = [];
    for (let index = 0; index < embeddingDimension; index += 1) {
      embedding.push(plaintext.readFloatLE(index * 4));
    }
    return embedding;
  }

  private toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(buffer.length);
    bytes.set(buffer);
    return bytes;
  }
}
