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
  errorCode?: string;
  feature?: string;
  featureKey?: string;
  errors?: unknown;
  retryAfterSeconds?: number;
  cooldownSeconds?: number;
  requestedAmount?: number;
  availableAmount?: number;
  periodMonth?: number;
  periodYear?: number;
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
    let errorCode: string | undefined;
    let feature: string | undefined;
    let featureKey: string | undefined;
    let errors: unknown;
    let retryAfterSeconds: number | undefined;
    let cooldownSeconds: number | undefined;
    let requestedAmount: number | undefined;
    let availableAmount: number | undefined;
    let periodMonth: number | undefined;
    let periodYear: number | undefined;

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
        if (typeof body.errorCode === 'string') errorCode = body.errorCode;
        if (typeof body.feature === 'string') feature = body.feature;
        if (typeof body.featureKey === 'string') {
          featureKey = body.featureKey;
        }
        if ('errors' in body) errors = body.errors;
        if (typeof body.retryAfterSeconds === 'number') {
          retryAfterSeconds = body.retryAfterSeconds;
        }
        if (typeof body.cooldownSeconds === 'number') {
          cooldownSeconds = body.cooldownSeconds;
        }
        if (typeof body.requestedAmount === 'number') {
          requestedAmount = body.requestedAmount;
        }
        if (typeof body.availableAmount === 'number') {
          availableAmount = body.availableAmount;
        }
        if (typeof body.periodMonth === 'number') {
          periodMonth = body.periodMonth;
        }
        if (typeof body.periodYear === 'number') {
          periodYear = body.periodYear;
        }
      }
    } else if (exception instanceof Error) {
      // Unexpected error: log the stack but never leak internals to clients.
      this.logger.error(exception.message, exception.stack);
    }

    if (exception instanceof ThrottlerException) {
      message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau';
    }

    if (exception instanceof ThrottlerException) {
      code = code ?? 'RATE_LIMITED';
      errorCode = errorCode ?? code;
    }
    if (!code && errorCode) code = errorCode;
    if (!errorCode && code && code !== 'FEATURE_LOCKED') errorCode = code;
    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      statusCode,
      ...(code ? { code } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(feature ? { feature } : {}),
      ...(featureKey ? { featureKey } : {}),
      ...(errors !== undefined ? { errors } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(cooldownSeconds !== undefined ? { cooldownSeconds } : {}),
      ...(requestedAmount !== undefined ? { requestedAmount } : {}),
      ...(availableAmount !== undefined ? { availableAmount } : {}),
      ...(periodMonth !== undefined ? { periodMonth } : {}),
      ...(periodYear !== undefined ? { periodYear } : {}),
    };
    response.status(statusCode).json(body);
  }
}
