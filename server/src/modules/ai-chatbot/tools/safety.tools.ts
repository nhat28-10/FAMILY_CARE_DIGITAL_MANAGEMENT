import { Injectable } from '@nestjs/common';
import { AiRelatedModule, FamilyRole } from '@prisma/client';

import { LocationsService } from '../../locations/locations.service';
import { SosService } from '../../sos/services/sos.service';
import type { AiToolDefinition, AiToolProvider } from './tool.types';

const ALL_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
  FamilyRole.FAMILY_MEMBER,
];

/** Tool an toàn (SOS + vị trí) — CHỈ ĐỌC, không có hành động ghi. */
@Injectable()
export class SafetyAiTools implements AiToolProvider {
  constructor(
    private readonly sosService: SosService,
    private readonly locationsService: LocationsService,
  ) {}

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'get_active_sos_alert',
        description:
          'Kiểm tra gia đình có cảnh báo SOS đang hoạt động không (kèm vị trí cuối nếu có). Dùng khi hỏi về tình trạng khẩn cấp.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        module: AiRelatedModule.SOS,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (_args, ctx) =>
          this.sosService.getActiveAlertForWorkspace(ctx.familyId),
      },
      {
        name: 'list_family_locations',
        description:
          'Vị trí hiện tại của các thành viên ĐANG BẬT chia sẻ vị trí. Dùng khi hỏi "mọi người đang ở đâu". Thành viên tắt chia sẻ sẽ không xuất hiện.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        // Enum AiRelatedModule không có LOCATION — gom vào SOS (nhóm an toàn).
        module: AiRelatedModule.SOS,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (_args, ctx) =>
          this.locationsService.listFamilyLocations(ctx.familyId),
      },
    ];
  }
}
