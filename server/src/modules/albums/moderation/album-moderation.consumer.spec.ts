import { ConfigService } from '@nestjs/config';

import { AlbumModerationConsumer } from './album-moderation.consumer';
import { AlbumModerationService } from './album-moderation.service';
import { AlbumFaceSuggestionsService } from '../album-face-suggestions.service';
import { CloudflareQueueService } from './cloudflare-queue.service';

function config() {
  const values: Record<string, unknown> = {
    'albumModeration.consumerEnabled': true,
    'albumModeration.pollIntervalMs': 1000,
    'albumModeration.retryDelaySeconds': 60,
    'albumModeration.maxAttempts': 3,
  };
  return {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('AlbumModerationConsumer', () => {
  it('acks poison messages without retrying forever', async () => {
    const queue = {
      pullMessages: jest
        .fn()
        .mockResolvedValue([
          { body: { invalid: true }, attempts: 1, leaseId: 'lease-1' },
        ]),
      acknowledgeMessages: jest.fn().mockResolvedValue(undefined),
      retryMessages: jest.fn().mockResolvedValue(undefined),
    };
    const moderation = { parseJob: jest.fn().mockReturnValue(null) };
    const faceSuggestions = { parseJob: jest.fn().mockReturnValue(null) };
    const consumer = new AlbumModerationConsumer(
      queue as unknown as CloudflareQueueService,
      moderation as unknown as AlbumModerationService,
      faceSuggestions as unknown as AlbumFaceSuggestionsService,
      config(),
    );
    await consumer.poll();
    expect(queue.acknowledgeMessages).toHaveBeenCalledWith(['lease-1']);
    expect(queue.retryMessages).toHaveBeenCalledWith([]);
  });

  it('does not overlap polls in one instance', async () => {
    let release: ((value: []) => void) | undefined;
    const pending = new Promise<[]>((resolve) => {
      release = resolve;
    });
    const queue = {
      pullMessages: jest.fn().mockReturnValue(pending),
      acknowledgeMessages: jest.fn(),
      retryMessages: jest.fn(),
    };
    const consumer = new AlbumModerationConsumer(
      queue as unknown as CloudflareQueueService,
      { parseJob: jest.fn() } as unknown as AlbumModerationService,
      { parseJob: jest.fn() } as unknown as AlbumFaceSuggestionsService,
      config(),
    );
    const first = consumer.poll();
    await consumer.poll();
    expect(queue.pullMessages).toHaveBeenCalledTimes(1);
    release?.([]);
    await first;
  });

  it('moves unexpected poison job to NEED_REVIEW and acks at max attempts', async () => {
    const job = { jobId: 'job-1' };
    const queue = {
      pullMessages: jest
        .fn()
        .mockResolvedValue([
          { body: job, attempts: 3, leaseId: 'lease-poison' },
        ]),
      acknowledgeMessages: jest.fn().mockResolvedValue(undefined),
      retryMessages: jest.fn().mockResolvedValue(undefined),
    };
    const moderation = {
      parseJob: jest.fn().mockReturnValue(job),
      processJob: jest.fn().mockRejectedValue(new Error('unexpected token=x')),
      completePoisonedJob: jest.fn().mockResolvedValue(undefined),
    };
    const faceSuggestions = { parseJob: jest.fn().mockReturnValue(null) };
    const consumer = new AlbumModerationConsumer(
      queue as unknown as CloudflareQueueService,
      moderation as unknown as AlbumModerationService,
      faceSuggestions as unknown as AlbumFaceSuggestionsService,
      config(),
    );

    await consumer.poll();

    expect(moderation.completePoisonedJob).toHaveBeenCalledWith(
      job,
      expect.any(Error),
    );
    expect(queue.acknowledgeMessages).toHaveBeenCalledWith(['lease-poison']);
    expect(queue.retryMessages).toHaveBeenCalledWith([]);
  });
});
