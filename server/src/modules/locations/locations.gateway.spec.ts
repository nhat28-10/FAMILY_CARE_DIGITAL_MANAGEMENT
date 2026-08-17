import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

import type { FamilyMembersService } from '../family-members/family-members.service';
import type { UsersService } from '../users/users.service';
import { LocationsGateway } from './locations.gateway';

describe('LocationsGateway', () => {
  const workspaceId = 'family-id';
  const userId = 'user-id';
  let gateway: LocationsGateway;
  let familyMembersService: jest.Mocked<
    Pick<FamilyMembersService, 'findByFamilyAndUser'>
  >;

  beforeEach(() => {
    familyMembersService = {
      findByFamilyAndUser: jest.fn(),
    };
    gateway = new LocationsGateway(
      {} as unknown as JwtService,
      {} as unknown as ConfigService,
      {} as unknown as UsersService,
      familyMembersService as unknown as FamilyMembersService,
    );
  });

  it('joins a workspace room after membership is verified', async () => {
    familyMembersService.findByFamilyAndUser.mockResolvedValue({
      id: 'member-id',
    } as Awaited<ReturnType<FamilyMembersService['findByFamilyAndUser']>>);
    const join = jest.fn().mockResolvedValue(undefined);
    const client = {
      data: { userId },
      join,
      emit: jest.fn(),
    } as unknown as Socket;

    await expect(gateway.handleJoin(client, { workspaceId })).resolves.toEqual({
      joined: true,
      workspaceId,
    });

    expect(familyMembersService.findByFamilyAndUser).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(join).toHaveBeenCalledWith(`workspace:${workspaceId}`);
  });

  it('emits location updates to the workspace room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as unknown as Server;
    const payload = { memberId: 'member-id', latitude: 10, longitude: 106 };

    gateway.emitLocationUpdated(workspaceId, payload);

    expect(to).toHaveBeenCalledWith(`workspace:${workspaceId}`);
    expect(emit).toHaveBeenCalledWith('location:updated', payload);
  });
});
