import { ConfigService } from '@nestjs/config';
import { MediaCheckResult } from '@prisma/client';

import { CloudflareWorkersAiService } from './cloudflare-workers-ai.service';
import { ModerationProviderError } from './moderation.types';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function config() {
  const values: Record<string, unknown> = {
    'cloudflare.accountId': 'account',
    'cloudflare.apiToken': 'secret-token',
    'cloudflare.aiModel': '@cf/meta/llama-3.2-11b-vision-instruct',
    'cloudflare.aiTimeoutMs': 100,
    'albumModeration.maxAttempts': 3,
  };
  return {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function response(decision: string) {
  return new Response(
    JSON.stringify({
      success: true,
      result: {
        response: {
          decision,
          riskScore: 0.2,
          categories: [{ code: 'NUDITY', score: 0.1 }],
          reasonCode: 'LOW_RISK',
          summary: 'Không phát hiện rủi ro đáng kể.',
        },
      },
    }),
    { status: 200 },
  );
}

describe('CloudflareWorkersAiService', () => {
  let service: CloudflareWorkersAiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new CloudflareWorkersAiService(config());
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    MediaCheckResult.SAFE,
    MediaCheckResult.NEED_REVIEW,
    MediaCheckResult.FLAGGED,
  ])('parses %s structured output', async (decision) => {
    fetchMock.mockResolvedValue(response(decision));
    await expect(
      service.moderateImage(png, 'image/png'),
    ).resolves.toMatchObject({
      decision,
      riskScore: 0.2,
    });
  });

  it('rejects invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }));
    await expect(service.moderateImage(png, 'image/png')).rejects.toMatchObject(
      {
        code: 'AI_INVALID_JSON',
        transient: false,
      },
    );
  });

  it('rejects missing fields', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: { response: { decision: 'SAFE' } },
        }),
        { status: 200 },
      ),
    );
    await expect(service.moderateImage(png, 'image/png')).rejects.toMatchObject(
      {
        code: 'AI_INVALID_RESPONSE',
      },
    );
  });

  it('retries timeout and keeps it transient', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    await expect(service.moderateImage(png, 'image/png')).rejects.toMatchObject(
      {
        code: 'AI_TIMEOUT',
        transient: true,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([429, 500, 503])('retries transient HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status }),
    );
    const error = await service
      .moderateImage(png, 'image/png')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModerationProviderError);
    expect((error as ModerationProviderError).transient).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects an oversized provider response', async () => {
    fetchMock.mockResolvedValue(
      new Response('x'.repeat(1024 * 1024 + 1), { status: 200 }),
    );
    await expect(service.moderateImage(png, 'image/png')).rejects.toMatchObject(
      {
        code: 'AI_RESPONSE_TOO_LARGE',
      },
    );
  });

  it('treats JSON Mode HTTP 400 as non-transient', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 400 }),
    );
    await expect(service.moderateImage(png, 'image/png')).rejects.toMatchObject(
      {
        code: 'AI_HTTP_400',
        transient: false,
      },
    );
  });
});
