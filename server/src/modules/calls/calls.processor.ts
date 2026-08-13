import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CALLS_QUEUE, CALL_TIMEOUT_JOB } from './calls.types';
import type { CallTimeoutJobData } from './calls.types';
import { CallsService } from './services/calls.service';

@Processor(CALLS_QUEUE)
export class CallsProcessor extends WorkerHost {
  private readonly logger = new Logger(CallsProcessor.name);

  constructor(private readonly callsService: CallsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === CALL_TIMEOUT_JOB) {
      const { callId } = job.data as CallTimeoutJobData;
      return this.callsService.handleCallTimeout(callId);
    }
    this.logger.warn(`Job không xác định: ${job.name}`);
  }
}
