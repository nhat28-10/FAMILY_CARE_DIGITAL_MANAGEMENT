import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  code?: string;
  feature?: string;
  errors?: unknown;
}

/**
 * Catches every exception and converts it into the standard error envelope:
 *   { success: false, message: string, statusCode: number }
 *
 * For class-validator failures (where `message` is an array) the first
 * message is surfaced so the client always receives a single string.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Lỗi hệ thống';
    let code: string | undefined;
    let feature: string | undefined;
    let errors: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        const raw = body.message;
        if (Array.isArray(raw)) {
          message = String(raw[0]);
        } else if (typeof raw === 'string') {
          message = raw;
        } else {
          message = exception.message;
        }

        if (typeof body.code === 'string') code = body.code;
        if (typeof body.feature === 'string') feature = body.feature;
        if ('errors' in body) errors = body.errors;
      }
    } else if (exception instanceof Error) {
      // Unexpected error: log the stack but never leak internals to clients.
      this.logger.error(exception.message, exception.stack);
    }

    if (exception instanceof ThrottlerException) {
      message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau';
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      statusCode,
      ...(code ? { code } : {}),
      ...(feature ? { feature } : {}),
      ...(errors !== undefined ? { errors } : {}),
    };
    response.status(statusCode).json(body);
  }
}
