import { BadRequestException } from '@nestjs/common';
import { AccountStatus, UserType, VerificationStatus } from '@prisma/client';
import type { Request } from 'express';

import type { SafeUser } from '../../users/users.types';
import { AdminAuditLogsService } from '../admin-audit-logs.service';
import { AdminService } from '../admin.service';
import { AdminUsersController } from './admin-users.controller';

describe('AdminUsersController audit logging', () => {
  const adminUser: SafeUser = {
    id: 'admin-id',
    email: 'admin@example.com',
    firebaseUid: null,
    fullName: 'Admin User',
    phone: null,
    avatarUrl: null,
    userType: UserType.SYSTEM_ADMIN,
    accountStatus: AccountStatus.ACTIVE,
    verificationStatus: VerificationStatus.VERIFIED,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const request = { ip: '127.0.0.1', headers: {} } as Request;
  let admin: { updateUser: jest.Mock; deleteUser: jest.Mock };
  let auditLogs: {
    record: jest.Mock;
    requestContext: jest.Mock;
    errorMessage: jest.Mock;
  };
  let controller: AdminUsersController;

  beforeEach(() => {
    admin = {
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
    };
    auditLogs = {
      record: jest.fn().mockResolvedValue(undefined),
      requestContext: jest.fn().mockReturnValue({
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      }),
      errorMessage: jest.fn((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      ),
    };
    controller = new AdminUsersController(
      admin as unknown as AdminService,
      auditLogs as unknown as AdminAuditLogsService,
    );
  });

  it('audits successful user updates', async () => {
    admin.updateUser.mockResolvedValue({ id: 'user-id' });

    await controller.update('user-id', adminUser, request, {
      fullName: 'Updated',
    });

    expect(admin.updateUser).toHaveBeenCalledWith(
      'user-id',
      { fullName: 'Updated' },
      adminUser.id,
    );
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: adminUser.id,
        action: 'ADMIN_USER_UPDATE',
        targetType: 'USER',
        targetId: 'user-id',
        result: 'SUCCESS',
      }),
    );
  });

  it('audits failed lock attempts', async () => {
    const error = new BadRequestException('blocked');
    admin.updateUser.mockRejectedValue(error);

    await expect(
      controller.update('other-admin-id', adminUser, request, {
        accountStatus: AccountStatus.SUSPENDED,
      }),
    ).rejects.toBe(error);

    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_USER_LOCK',
        targetId: 'other-admin-id',
        result: 'FAILED',
        errorMessage: 'blocked',
      }),
    );
  });

  it('audits successful user deletes', async () => {
    admin.deleteUser.mockResolvedValue(null);

    await controller.remove('user-id', adminUser, request);

    expect(admin.deleteUser).toHaveBeenCalledWith('user-id', adminUser.id);
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_USER_DELETE',
        targetType: 'USER',
        targetId: 'user-id',
        result: 'SUCCESS',
      }),
    );
  });

  it('audits failed user deletes', async () => {
    const error = new BadRequestException('blocked');
    admin.deleteUser.mockRejectedValue(error);

    await expect(
      controller.remove('other-admin-id', adminUser, request),
    ).rejects.toBe(error);

    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_USER_DELETE',
        targetId: 'other-admin-id',
        result: 'FAILED',
        errorMessage: 'blocked',
      }),
    );
  });
});
