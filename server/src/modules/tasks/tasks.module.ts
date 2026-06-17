import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { TaskAssignmentsController } from './controllers/task-assignments.controller';
import { TaskCategoriesController } from './controllers/task-categories.controller';
import { TaskProofsController } from './controllers/task-proofs.controller';
import { TaskSubmissionsController } from './controllers/task-submissions.controller';
import { TaskTaskAssignmentsController } from './controllers/task-task-assignments.controller';
import { TasksController } from './controllers/tasks.controller';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [FamilyMembersModule],
  controllers: [
    TaskCategoriesController,
    TaskAssignmentsController,
    TaskSubmissionsController,
    TaskProofsController,
    TaskTaskAssignmentsController,
    TasksController,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
