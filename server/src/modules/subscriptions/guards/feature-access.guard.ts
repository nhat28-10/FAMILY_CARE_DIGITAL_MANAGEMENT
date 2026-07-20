import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_FEATURES_KEY } from '../decorators/require-feature.decorator';
import { FeatureAccessService } from '../feature-access.service';

interface RequestWithParams {
  params?: Record<string, string>;
}

@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureAccessService: FeatureAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithParams>();
    const familyId = request.params?.familyId;
    if (!familyId) {
      throw new BadRequestException('Thiếu tham số familyId trên đường dẫn');
    }

    const result = await this.featureAccessService.canUseFeatures(
      familyId,
      requiredFeatures,
    );
    if (!result.allowed) {
      throw new ForbiddenException(result.message);
    }

    return true;
  }
}
