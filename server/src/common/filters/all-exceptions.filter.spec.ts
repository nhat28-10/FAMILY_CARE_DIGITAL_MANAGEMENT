import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { FeatureNotAvailableException } from '../../modules/subscriptions/feature-not-available.exception';

function hostWith() {
  const json = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader, status }) }),
  } as any;
  return { host, setHeader, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('map ThrottlerException sang 429 + message tiếng Việt', () => {
    const { host, status, json } = hostWith();
    filter.catch(new ThrottlerException(), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
      code: 'RATE_LIMITED',
      errorCode: 'RATE_LIMITED',
    });
  });

  it('giữ message gốc cho HttpException thường', () => {
    const { host, json } = hostWith();
    filter.catch(new HttpException('Email đã được sử dụng', 409), host);
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 409,
      message: 'Email đã được sử dụng',
    });
  });

  it('tra ve dung contract feature locked cho FE', () => {
    const { host, json } = hostWith();
    filter.catch(
      new FeatureNotAvailableException('calendar.recurringEvents'),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Tính năng yêu cầu nâng cấp gói.',
      code: 'FEATURE_LOCKED',
      featureKey: 'calendar.recurringEvents',
    });
  });

  it('them Retry-After khi HttpException co retryAfterSeconds', () => {
    const { host, setHeader, json } = hostWith();
    filter.catch(
      new HttpException(
        {
          message: 'Too many face scan requests',
          code: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
          errorCode: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
          retryAfterSeconds: 600,
          cooldownSeconds: 600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      host,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '600');
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many face scan requests',
      code: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
      errorCode: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
      retryAfterSeconds: 600,
      cooldownSeconds: 600,
    });
  });

  it('giu metadata loi chia quy cho client', () => {
    const { host, json } = hostWith();
    filter.catch(
      new HttpException(
        {
          message: 'So tien chia quy vuot qua quy kha dung cua ky nay',
          code: 'INSUFFICIENT_AVAILABLE_FUND',
          requestedAmount: 100000,
          availableAmount: 50000,
          periodMonth: 12,
          periodYear: 2026,
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'So tien chia quy vuot qua quy kha dung cua ky nay',
      code: 'INSUFFICIENT_AVAILABLE_FUND',
      errorCode: 'INSUFFICIENT_AVAILABLE_FUND',
      requestedAmount: 100000,
      availableAmount: 50000,
      periodMonth: 12,
      periodYear: 2026,
    });
  });
});
