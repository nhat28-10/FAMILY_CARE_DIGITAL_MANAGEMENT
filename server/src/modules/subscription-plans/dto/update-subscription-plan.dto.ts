import { PartialType } from '@nestjs/swagger';

import { CreateSubscriptionPlanDto } from './create-subscription-plan.dto';

/** All fields optional; same validation rules as create. */
export class UpdateSubscriptionPlanDto extends PartialType(
  CreateSubscriptionPlanDto,
) {}
