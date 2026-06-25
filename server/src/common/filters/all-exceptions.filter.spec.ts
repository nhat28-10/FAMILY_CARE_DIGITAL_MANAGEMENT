import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { AllExceptionsFilter } from './all-exceptions.filter';

function hostWith() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as any;
  return { host, status, json };
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
});
