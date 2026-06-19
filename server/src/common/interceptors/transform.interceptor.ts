import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { isDynamicResponse } from '../types/dynamic-response';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * Wraps every successful controller result in the standard envelope:
 *   { success: true, message: string, data: T }
 *
 * The message comes from the @ResponseMessage() decorator, defaulting to
 * "Thành công" when none is provided.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || 'Thành công';

    return next.handle().pipe(
      map((data) => {
        if (isDynamicResponse<T>(data)) {
          return {
            success: true as const,
            message: data.__responseMessage,
            data: data.data,
          };
        }

        return {
          success: true as const,
          message,
          data: (data ?? null) as T,
        };
      }),
    );
  }
}
