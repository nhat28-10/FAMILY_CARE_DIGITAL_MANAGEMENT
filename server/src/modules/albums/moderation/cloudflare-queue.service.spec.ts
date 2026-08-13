import { ConfigService } from '@nestjs/config';
import { AlbumMediaType } from '@prisma/client';

import { CloudflareQueueService } from './cloudflare-queue.service';
import {
  AlbumModerationJob,
  ModerationProviderError,
} from './moderation.types';

const job: AlbumModerationJob = {
  version: 1,
  type: 'ALBUM_MEDIA_MODERATION',
  jobId: '11111111-1111-4111-8111-111111111111',
  mediaId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  storageKey: 'album-media/33333333-3333-4333-8333-333333333333/file.jpg',
  mediaType: AlbumMediaType.PHOTO,
  requestedAt: '2026-07-11T00:00:00.000Z',
};

function config() {
  const values: Record<string, unknown> = {
    'cloudflare.accountId': 'account',
    'cloudflare.queueId': 'queue',
    'cloudflare.queueApiToken': 'secret-token',
    'cloudflare.aiTimeoutMs': 100,
    'albumModeration.batchSize': 2,
    'albumModeration.visibilityTimeoutMs': 180000,
  };
  return {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('CloudflareQueueService', () => {
  let service: CloudflareQueueService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new CloudflareQueueService(config());
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  it('pushes the documented JSON message body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: {} }), {
        status: 200,
      }),
    );
    await service.pushModerationJob(job);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      body: job,
      content_type: 'json',
    });
  });

  it('pulls and maps queue messages', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            messages: [
              { id: 'm1', attempts: 2, body: job, lease_id: 'lease-1' },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    await expect(service.pullMessages()).resolves.toEqual([
      { id: 'm1', attempts: 2, body: job, leaseId: 'lease-1' },
    ]);
  });

  it('acks lease IDs using the official ack body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: {} }), {
        status: 200,
      }),
    );
    await service.acknowledgeMessages(['lease-1']);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      acks: [{ lease_id: 'lease-1' }],
      retries: [],
    });
  });

  it('retries lease IDs with delay', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: {} }), {
        status: 200,
      }),
    );
    await service.retryMessages([{ leaseId: 'lease-1', delaySeconds: 60 }]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      acks: [],
      retries: [{ lease_id: 'lease-1', delay_seconds: 60 }],
    });
  });

  it('classifies timeout as transient without exposing token', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    const error = await service
      .pullMessages()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModerationProviderError);
    expect((error as Error).message).not.toContain('secret-token');
    expect((error as ModerationProviderError).transient).toBe(true);
  });

  it.each([401, 403])('does not retry HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status }),
    );
    const error = await service
      .pullMessages()
      .catch((caught: unknown) => caught);
    expect((error as ModerationProviderError).transient).toBe(false);
  });

  it.each([429, 500, 503])('marks HTTP %s transient', async (status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status }),
    );
    const error = await service
      .pullMessages()
      .catch((caught: unknown) => caught);
    expect((error as ModerationProviderError).transient).toBe(true);
  });
});
