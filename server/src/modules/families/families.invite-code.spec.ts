import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { FamiliesService } from './families.service';
import { INVITE_CODE_LENGTH } from './invite-code.util';

describe('FamiliesService invite code', () => {
  const familyId = 'family-id';

  let prisma: { family: Record<string, jest.Mock> };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      family: {
        findUnique: jest.fn(),
        update: jest.fn((args: { data: { inviteCode: string } }) => ({
          id: familyId,
          inviteCode: args.data.inviteCode,
        })),
      },
    };
    service = new FamiliesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('getInviteCode', () => {
    it('trả inviteCode (null khi chưa tạo)', async () => {
      prisma.family.findUnique.mockResolvedValue({ inviteCode: null });
      await expect(service.getInviteCode(familyId)).resolves.toEqual({
        inviteCode: null,
      });
    });

    it('404 khi family không tồn tại', async () => {
      prisma.family.findUnique.mockResolvedValue(null);
      await expect(service.getInviteCode(familyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('regenerateInviteCode', () => {
    it('sinh mã mới 8 ký tự và lưu vào family', async () => {
      const result = await service.regenerateInviteCode(familyId);
      expect(result.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
      expect(prisma.family.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: familyId } }),
      );
    });

    it('retry khi trùng mã (P2002) rồi thành công', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.family.update
        .mockRejectedValueOnce(p2002)
        .mockImplementationOnce((args: { data: { inviteCode: string } }) => ({
          id: familyId,
          inviteCode: args.data.inviteCode,
        }));

      const result = await service.regenerateInviteCode(familyId);
      expect(result.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
      expect(prisma.family.update).toHaveBeenCalledTimes(2);
    });

    it('ném BadRequestException sau 5 lần trùng mã liên tiếp', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.family.update.mockRejectedValue(p2002);

      await expect(service.regenerateInviteCode(familyId)).rejects.toThrow(
        new BadRequestException('Không thể tạo mã mời, vui lòng thử lại'),
      );
      expect(prisma.family.update).toHaveBeenCalledTimes(5);
    });
  });
});
