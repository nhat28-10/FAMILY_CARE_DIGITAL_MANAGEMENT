import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminAuditLog, Prisma } from '@prisma/client';
import { Request } from 'express';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminAuditAction,
  AdminAuditResult,
  AdminAuditTargetType,
  ListAdminAuditLogsQueryDto,
} from './dto/list-admin-audit-logs-query.dto';

export type RecordAdminAuditLogInput = {
  adminUserId: string;
  adminEmail?: string | null;
  adminName?: string | null;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  result: AdminAuditResult;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  errorMessage?: string | null;
};

type AdminAuditLogResponse = {
  auditLogId: string;
  adminUserId: string;
  adminEmail: string | null;
  adminName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: Prisma.JsonValue | null;
  metadataSummary?: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEYWORDS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'databaseurl',
  'database_url',
  'stripe',
  'jwt',
  'env',
  'privatekey',
  'private_key',
];

@Injectable()
export class AdminAuditLogsService {
  private readonly logger = new Logger(AdminAuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAdminAuditLogInput): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminUserId: input.adminUserId,
          adminEmail: input.adminEmail ?? null,
          adminName: input.adminName ?? null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          result: input.result,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          metadata:
            input.metadata === undefined
              ? undefined
              : (this.sanitizeMetadata(
                  input.metadata,
                ) as Prisma.InputJsonValue),
          errorMessage: input.errorMessage ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không thể ghi admin audit log: ${message}`);
    }
  }

  requestContext(request: Request): {
    ipAddress?: string;
    userAgent?: string;
  } {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return {
      ipAddress: forwardedIp || request.ip,
      userAgent: request.headers['user-agent'],
    };
  }

  errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') {
        const raw = (response as Record<string, unknown>).message;
        if (Array.isArray(raw)) return String(raw[0]);
        if (typeof raw === 'string') return raw;
      }
    }

    if (error instanceof Error) return error.message;
    return 'Thao tác thất bại.';
  }

  async list(
    query: ListAdminAuditLogsQueryDto,
  ): Promise<PaginatedResult<AdminAuditLogResponse>> {
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return buildPaginated(
      items.map((item) => this.toListItem(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async get(auditLogId: string): Promise<AdminAuditLogResponse> {
    this.validateUuid(auditLogId);
    const item = await this.prisma.adminAuditLog.findUnique({
      where: { id: auditLogId },
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy audit log.');
    }

    return this.toDetail(item);
  }

  private buildWhere(
    query: ListAdminAuditLogsQueryDto,
  ): Prisma.AdminAuditLogWhereInput {
    return {
      adminUserId: query.adminUserId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      result: query.result,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
  }

  private toListItem(item: AdminAuditLog): AdminAuditLogResponse {
    return {
      auditLogId: item.id,
      adminUserId: item.adminUserId,
      adminEmail: item.adminEmail,
      adminName: item.adminName,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      result: item.result,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      metadataSummary: this.summarizeMetadata(
        this.sanitizeMetadata(item.metadata),
      ),
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
    };
  }

  private toDetail(item: AdminAuditLog): AdminAuditLogResponse {
    return {
      ...this.toListItem(item),
      metadata: this.sanitizeMetadata(item.metadata),
    };
  }

  private sanitizeMetadata(value: unknown, depth = 0): Prisma.JsonValue {
    if (depth > 5) return '[TRUNCATED]';
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();

    if (Array.isArray(value)) {
      return value
        .slice(0, 50)
        .map((item) => this.sanitizeMetadata(item, depth + 1));
    }

    if (typeof value === 'object') {
      const output: Record<string, Prisma.JsonValue> = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      ).slice(0, 100)) {
        if (this.isSensitiveKey(key)) {
          output[key] = '[REDACTED]';
          continue;
        }
        if (item !== undefined) {
          output[key] = this.sanitizeMetadata(item, depth + 1);
        }
      }
      return output;
    }

    if (typeof value === 'string') {
      return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.description ?? '[SYMBOL]';

    return null;
  }

  private summarizeMetadata(
    value: Prisma.JsonValue | null,
  ): Prisma.JsonValue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const summary: Record<string, Prisma.JsonValue> = {};
    for (const [key, item] of Object.entries(value).slice(0, 10)) {
      summary[key] = item as Prisma.JsonValue;
    }
    return summary;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private validateUuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException('Mã audit log không hợp lệ.');
    }
  }
}
