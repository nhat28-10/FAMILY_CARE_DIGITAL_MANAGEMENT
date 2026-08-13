import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { viValidationExceptionFactory } from '../../../common/validation/vi-validation.factory';

/**
 * Validate args do model sinh ra bằng CHÍNH DTO của REST endpoint tương ứng
 * (single-source validation). Sai → BadRequestException message tiếng Việt.
 */
export function validateActionArgs<T extends object>(
  dtoClass: new () => T,
  args: Record<string, unknown>,
): T {
  const instance = plainToInstance(dtoClass, args, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw viValidationExceptionFactory(errors);
  }
  return instance;
}
