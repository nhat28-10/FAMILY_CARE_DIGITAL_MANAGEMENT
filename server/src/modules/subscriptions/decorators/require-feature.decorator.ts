import { SetMetadata } from '@nestjs/common';

import type { FeatureAccessKey } from '../feature-access.constants';

export const REQUIRED_FEATURES_KEY = 'requiredFeatures';

export const RequireFeature = (...features: FeatureAccessKey[]) =>
  SetMetadata(REQUIRED_FEATURES_KEY, features);
