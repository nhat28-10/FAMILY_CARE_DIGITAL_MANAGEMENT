import { PartialType } from '@nestjs/swagger';

import { TaskProofDto } from './task-proof.dto';

export class UpdateTaskProofDto extends PartialType(TaskProofDto) {}
