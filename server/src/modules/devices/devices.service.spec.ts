import { DevicePlatform } from '@prisma/client';

import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let prisma: { deviceToken: { upsert: jest.Mock; deleteMany: jest.Mock } };
  let service: DevicesService;

  beforeEach(() => {
    prisma = {
      deviceToken: {
        upsert: jest.fn().mockResolvedValue({ id: 'd1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new DevicesService(prisma as never);
  });

  it('register upsert theo token, đổi chủ khi user khác đăng nhập cùng máy', async () => {
    await service.register('u1', {
      token: 'tok',
      platform: DevicePlatform.ANDROID,
      deviceName: 'Pixel',
    });
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'tok' },
      update: {
        userId: 'u1',
        platform: DevicePlatform.ANDROID,
        deviceName: 'Pixel',
      },
      create: {
        userId: 'u1',
        token: 'tok',
        platform: DevicePlatform.ANDROID,
        deviceName: 'Pixel',
      },
    });
  });

  it('remove chỉ xóa token thuộc user hiện tại', async () => {
    await service.remove('u1', 'tok');
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'tok', userId: 'u1' },
    });
  });
});
