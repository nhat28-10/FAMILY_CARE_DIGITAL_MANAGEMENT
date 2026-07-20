import { ForbiddenException } from '@nestjs/common';

export class FeatureNotAvailableException extends ForbiddenException {
  constructor(feature: string, message = 'Tính năng yêu cầu nâng cấp gói.') {
    super({
      code: 'FEATURE_NOT_AVAILABLE',
      feature,
      message,
    });
  }
}
