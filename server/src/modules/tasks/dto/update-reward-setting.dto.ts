import { PartialType } from '@nestjs/swagger';

import { CreateRewardSettingDto } from './create-reward-setting.dto';

export class UpdateRewardSettingDto extends PartialType(
  CreateRewardSettingDto,
) {}
