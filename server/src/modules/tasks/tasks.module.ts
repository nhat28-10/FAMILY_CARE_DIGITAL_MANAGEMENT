import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskAssignmentsController } from './controllers/task-assignments.controller';
import { TaskCategoriesController } from './controllers/task-categories.controller';
import { TaskProofsController } from './controllers/task-proofs.controller';
import { TaskRewardsController } from './controllers/task-rewards.controller';
import { TaskSchedulesController } from './controllers/task-schedules.controller';
import { TaskSubmissionsController } from './controllers/task-submissions.controller';
import { TaskUnavailabilitiesController } from './controllers/task-unavailabilities.controller';
import { TasksController } from './controllers/tasks.controller';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [FamilyMembersModule, NotificationsModule],
  controllers: [
    TaskCategoriesController,
    TaskAssignmentsController,
    TaskSubmissionsController,
    TaskProofsController,
    TaskRewardsController,
    TaskSchedulesController,
    TaskUnavailabilitiesController,
    TasksController,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
