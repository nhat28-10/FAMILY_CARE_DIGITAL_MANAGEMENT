import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global module so any feature module can inject PrismaService without having
 * to import PrismaModule explicitly.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
