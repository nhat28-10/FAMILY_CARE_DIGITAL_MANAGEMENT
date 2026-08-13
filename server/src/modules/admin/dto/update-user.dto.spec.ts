import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UserType } from '@prisma/client';

import { AdminUpdateUserDto } from './update-user.dto';
import { viValidationExceptionFactory } from '../../../common/validation/vi-validation.factory';

describe('AdminUpdateUserDto', () => {
  it('rejects userType because admin promotion is not exposed by this API', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: viValidationExceptionFactory,
    });

    await expect(
      pipe.transform(
        { userType: UserType.SYSTEM_ADMIN },
        {
          type: 'body',
          metatype: AdminUpdateUserDto,
          data: '',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
