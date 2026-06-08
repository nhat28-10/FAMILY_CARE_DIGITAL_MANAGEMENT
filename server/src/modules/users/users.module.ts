import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

/**
 * Users feature module. PrismaService is provided globally by PrismaModule,
 * so it does not need to be imported here.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
