import { Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/** Lưu trữ file dùng chung (Cloudflare R2) — import vào ChatsModule, AlbumsModule... */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
