import { BadRequestException } from '@nestjs/common';
import { AccountStatus, UserType, VerificationStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionLifecycleService } from '../billing/subscription-lifecycle.service';
import { AdminService } from './admin.service';

describe('AdminService multi-admin hardening', () => {
  const adminId = 'admin-id';
  const normalUser = {
    id: 'user-id',
    email: 'user@example.com',
    passwordHash: 'hash',
    firebaseUid: null,
    fullName: 'Normal User',
    phone: null,
    avatarUrl: null,
    userType: UserType.NORMAL_USER,
    accountStatus: AccountStatus.ACTIVE,
    verificationStatus: VerificationStatus.VERIFIED,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new AdminService(
      prisma as unknown as PrismaService,
      {} as SubscriptionLifecycleService,
    );
  });

  it('updates a normal user without exposing passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(normalUser);
    prisma.user.update.mockResolvedValue({
      ...normalUser,
      fullName: 'Updated Name',
    });

    const result = await service.updateUser(
      normalUser.id,
      { fullName: 'Updated Name' },
      adminId,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: normalUser.id },
      data: { fullName: 'Updated Name' },
    });
    expect(result.fullName).toBe('Updated Name');
    expect('passwordHash' in result).toBe(false);
  });

  it('rejects userType updates even if called directly', async () => {
    await expect(
      service.updateUser(
        normalUser.id,
        { userType: UserType.SYSTEM_ADMIN } as never,
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prevents an admin from locking their own account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...normalUser,
      id: adminId,
      userType: UserType.SYSTEM_ADMIN,
    });

    await expect(
      service.updateUser(
        adminId,
        { accountStatus: AccountStatus.SUSPENDED },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prevents locking another SYSTEM_ADMIN account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...normalUser,
      id: 'other-admin-id',
      userType: UserType.SYSTEM_ADMIN,
    });

    await expect(
      service.updateUser(
        'other-admin-id',
        { accountStatus: AccountStatus.INACTIVE },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prevents deleting own admin account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...normalUser,
      id: adminId,
      userType: UserType.SYSTEM_ADMIN,
    });

    await expect(service.deleteUser(adminId, adminId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('prevents deleting another SYSTEM_ADMIN account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...normalUser,
      id: 'other-admin-id',
      userType: UserType.SYSTEM_ADMIN,
    });

    await expect(
      service.deleteUser('other-admin-id', adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
