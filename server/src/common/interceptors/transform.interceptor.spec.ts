import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { of, lastValueFrom } from 'rxjs';

import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { withResponseMessage } from '../types/dynamic-response';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  const handleWith = (data: unknown) => ({
    handle: jest.fn(() => of(data)),
  });

  it('serializes Decimal values before wrapping a normal response', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('OK');
    const interceptor = new TransformInterceptor(reflector);

    const result = await lastValueFrom(
      interceptor.intercept(
        context,
        handleWith({
          targetAmount: new Prisma.Decimal('30000000.00'),
        }),
      ),
    );

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    expect(result).toEqual({
      success: true,
      message: 'OK',
      data: {
        targetAmount: 30000000,
      },
    });
  });

  it('serializes Decimal values before wrapping a DynamicResponse', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const interceptor = new TransformInterceptor(reflector);

    const result = await lastValueFrom(
      interceptor.intercept(
        context,
        handleWith(
          withResponseMessage('Created', {
            latitude: new Prisma.Decimal('10.7626220'),
          }),
        ),
      ),
    );

    expect(result).toEqual({
      success: true,
      message: 'Created',
      data: {
        latitude: 10.762622,
      },
    });
  });
});
