import { Injectable } from '@nestjs/common';
import type { FamilySubscriptionStatus } from '@prisma/client';

import { SubscriptionsService } from './subscriptions.service';

export interface FeatureAccessResult {
  allowed: boolean;
  status: FamilySubscriptionStatus;
  planCode: string;
  currentPeriodEnd: Date | null;
  missingFeature?: string;
  message: string;
}

type JsonObject = Record<string, unknown>;

@Injectable()
export class FeatureAccessService {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canUseFeatures(
    familyId: string,
    features: string[],
  ): Promise<FeatureAccessResult> {
    const subscription =
      await this.subscriptionsService.getFamilySubscriptionAccess(familyId);
    if (!subscription.active) {
      return {
        ...subscription,
        allowed: false,
        missingFeature: features[0],
        message: 'Tính năng yêu cầu nâng cấp gói.',
      };
    }

    const access = subscription.featureAccess;
    for (const feature of features) {
      if (!this.readBooleanFeature(access, feature)) {
        return {
          ...subscription,
          allowed: false,
          missingFeature: feature,
          message: 'Tính năng yêu cầu nâng cấp gói.',
        };
      }
    }

    return {
      ...subscription,
      allowed: true,
      message: 'Gói hiện tại được phép sử dụng tính năng này.',
    };
  }

  private readBooleanFeature(access: unknown, path: string): boolean {
    if (!this.isObject(access)) return false;

    const flatValue = access[path];
    if (typeof flatValue === 'boolean') return flatValue;

    let cursor: unknown = access;
    for (const segment of path.split('.')) {
      if (!this.isObject(cursor) || !(segment in cursor)) {
        return false;
      }
      cursor = cursor[segment];
    }

    return cursor === true;
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
