import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateEmergencyContactDto } from '../dto/create-emergency-contact.dto';
import type { UpdateEmergencyContactDto } from '../dto/update-emergency-contact.dto';
import type { UpdateSosSettingsDto } from '../dto/update-sos-settings.dto';

/** Mirrors the schema defaults of `sos_settings` for families without a row. */
const DEFAULT_SETTINGS = {
  isEnabled: true,
  notifyAllMembers: true,
  autoCreateAlertFromFall: false,
  locationRequired: true,
} as const;

/** Per-family SOS configuration + emergency contact book. */
@Injectable()
export class SosSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Settings row of the family, created with defaults on first access. */
  getOrCreate(workspaceId: string, memberId?: string) {
    return this.prisma.sosSetting.upsert({
      where: { workspaceId },
      update: {},
      create: { workspaceId, createdByMemberId: memberId ?? null },
    });
  }

  /**
   * Read-only effective config for enforcement paths (trigger, sensor ingest).
   * Falls back to schema defaults without writing a row.
   */
  async getEffective(workspaceId: string) {
    const row = await this.prisma.sosSetting.findUnique({
      where: { workspaceId },
    });
    return row ?? DEFAULT_SETTINGS;
  }

  update(workspaceId: string, memberId: string, dto: UpdateSosSettingsDto) {
    return this.prisma.sosSetting.upsert({
      where: { workspaceId },
      update: { ...dto },
      create: { workspaceId, createdByMemberId: memberId, ...dto },
    });
  }

  // ---------------------------------------------------------------------------
  // Emergency contacts
  // ---------------------------------------------------------------------------

  async listContacts(workspaceId: string) {
    const settings = await this.getOrCreate(workspaceId);
    return this.prisma.emergencyContact.findMany({
      where: { sosSettingId: settings.id },
      orderBy: [{ priorityOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addContact(
    workspaceId: string,
    memberId: string,
    dto: CreateEmergencyContactDto,
  ) {
    const settings = await this.getOrCreate(workspaceId, memberId);
    const priorityOrder =
      dto.priorityOrder ?? (await this.nextPriorityOrder(settings.id));
    return this.prisma.emergencyContact.create({
      data: {
        sosSettingId: settings.id,
        contactName: dto.contactName,
        phoneNumber: dto.phoneNumber,
        relationshipNote: dto.relationshipNote ?? null,
        priorityOrder,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateContact(
    workspaceId: string,
    contactId: string,
    dto: UpdateEmergencyContactDto,
  ) {
    await this.assertContactInWorkspace(workspaceId, contactId);
    return this.prisma.emergencyContact.update({
      where: { id: contactId },
      data: { ...dto },
    });
  }

  async removeContact(workspaceId: string, contactId: string) {
    await this.assertContactInWorkspace(workspaceId, contactId);
    return this.prisma.emergencyContact.delete({ where: { id: contactId } });
  }

  private async assertContactInWorkspace(
    workspaceId: string,
    contactId: string,
  ) {
    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, sosSetting: { workspaceId } },
    });
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ khẩn cấp');
    }
    return contact;
  }

  private async nextPriorityOrder(sosSettingId: string) {
    const { _max } = await this.prisma.emergencyContact.aggregate({
      where: { sosSettingId },
      _max: { priorityOrder: true },
    });
    return (_max.priorityOrder ?? 0) + 1;
  }
}
