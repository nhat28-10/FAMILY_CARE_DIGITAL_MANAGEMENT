import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ModerationProviderError } from './moderation.types';

@Injectable()
export class VideoFrameService {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly intervalSeconds: number;
  private readonly maxFrames: number;
  private readonly concurrency: number;

  constructor(config: ConfigService) {
    this.ffmpegPath = config.get<string>(
      'albumModeration.ffmpegPath',
      'ffmpeg',
    );
    this.ffprobePath = config.get<string>(
      'albumModeration.ffprobePath',
      'ffprobe',
    );
    this.intervalSeconds = Math.max(
      1,
      config.get<number>('albumModeration.videoFrameIntervalSeconds', 5),
    );
    this.maxFrames = Math.max(
      1,
      config.get<number>('albumModeration.videoMaxFrames', 12),
    );
    this.concurrency = Math.min(
      2,
      Math.max(
        1,
        config.get<number>('albumModeration.videoFrameConcurrency', 1),
      ),
    );
  }

  async extractFrames(video: Buffer): Promise<Buffer[]> {
    const directory = await mkdtemp(join(tmpdir(), 'album-moderation-'));
    const videoPath = join(directory, `${randomUUID()}.mp4`);
    try {
      await writeFile(videoPath, video);
      const duration = await this.readDuration(videoPath);
      const timestamps = this.buildTimestamps(duration);
      const framePaths = timestamps.map(() =>
        join(directory, `${randomUUID()}.jpg`),
      );
      await this.mapWithConcurrency(
        timestamps.map((timestamp, index) => ({
          timestamp,
          outputPath: framePaths[index],
        })),
        async ({ timestamp, outputPath }) => {
          await this.runProcess(this.ffmpegPath, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            timestamp.toFixed(3),
            '-i',
            videoPath,
            '-frames:v',
            '1',
            '-q:v',
            '2',
            '-y',
            outputPath,
          ]);
        },
      );
      return Promise.all(framePaths.map((path) => readFile(path)));
    } catch (error) {
      if (error instanceof ModerationProviderError) throw error;
      throw new ModerationProviderError(
        'Không thể trích frame video',
        'VIDEO_FRAME_EXTRACTION_FAILED',
        false,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async readDuration(videoPath: string): Promise<number> {
    const output = await this.runProcess(this.ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    const duration = Number.parseFloat(output.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ModerationProviderError(
        'Không đọc được thời lượng video',
        'FFPROBE_INVALID_DURATION',
        false,
      );
    }
    return duration;
  }

  private buildTimestamps(duration: number): number[] {
    const nearEnd = Math.max(0, duration - 0.5);
    const intervalFrames: number[] = [];
    for (
      let second = this.intervalSeconds;
      second < duration;
      second += this.intervalSeconds
    ) {
      intervalFrames.push(second);
    }
    const timestamps = [
      0,
      ...intervalFrames.slice(0, Math.max(0, this.maxFrames - 2)),
      nearEnd,
    ];
    return [...new Set(timestamps)]
      .sort((a, b) => a - b)
      .slice(0, this.maxFrames);
  }

  private runProcess(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new ModerationProviderError(
            'FFmpeg/ffprobe timeout',
            'FFMPEG_TIMEOUT',
            false,
          ),
        );
      }, 120000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = `${stdout}${chunk.toString('utf8')}`.slice(-4096);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4096);
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        reject(
          new ModerationProviderError(
            error.code === 'ENOENT'
              ? 'FFmpeg/ffprobe không khả dụng'
              : 'Không thể chạy FFmpeg/ffprobe',
            error.code === 'ENOENT'
              ? 'FFMPEG_NOT_AVAILABLE'
              : 'FFMPEG_PROCESS_ERROR',
            false,
          ),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout);
        else
          reject(
            new ModerationProviderError(
              stderr
                ? 'FFmpeg/ffprobe xử lý thất bại'
                : 'FFmpeg/ffprobe thất bại',
              'FFMPEG_EXIT_ERROR',
              false,
            ),
          );
      });
    });
  }

  private async mapWithConcurrency<T>(
    items: T[],
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    const runners = Array.from(
      { length: Math.min(this.concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const item = items[index];
          index += 1;
          await worker(item);
        }
      },
    );
    await Promise.all(runners);
  }
}
