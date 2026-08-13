import { Injectable } from '@nestjs/common';
import {
  AlbumVisibilityScope,
  FamilyMember,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
} from '@prisma/client';

export interface AlbumMediaPolicyResource {
  workspaceId: string;
  uploadedByMemberId: string;
  visibilityScope: AlbumVisibilityScope;
  moderationStatus: MediaModerationStatus;
  deletedAt?: Date | null;
}

export interface AlbumMediaTagPolicyResource {
  taggedMemberId: string;
  taggedByMemberId: string;
}

@Injectable()
export class AlbumMediaPolicy {
  isManager(member: Pick<FamilyMember, 'familyRole'>): boolean {
    return (
      member.familyRole === FamilyRole.FAMILY_MANAGER ||
      member.familyRole === FamilyRole.DEPUTY_MEMBER
    );
  }

  canViewMetadata(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyId' | 'familyRole'>,
  ): boolean {
    if (media.workspaceId !== member.familyId) return false;
    const isUploader = media.uploadedByMemberId === member.id;
    const isManager = this.isManager(member);

    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      return isUploader || isManager;
    }
    return this.passesVisibility(media, isUploader, isManager);
  }

  canViewFile(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyId' | 'familyRole'>,
  ): boolean {
    if (media.workspaceId !== member.familyId) return false;
    const isUploader = media.uploadedByMemberId === member.id;
    const isManager = this.isManager(member);

    if (
      media.moderationStatus === MediaModerationStatus.FLAGGED ||
      media.moderationStatus === MediaModerationStatus.NEED_REVIEW
    ) {
      return isManager;
    }
    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      return isUploader || isManager;
    }
    return this.passesVisibility(media, isUploader, isManager);
  }

  canMemberAccessMedia(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyId' | 'familyRole' | 'status'>,
  ): boolean {
    return (
      member.status === MemberStatus.ACTIVE &&
      this.canViewMetadata(media, member)
    );
  }

  canCreateTag(
    media: AlbumMediaPolicyResource,
    requester: Pick<FamilyMember, 'id' | 'familyId' | 'familyRole' | 'status'>,
    taggedMember: Pick<
      FamilyMember,
      'id' | 'familyId' | 'familyRole' | 'status'
    >,
  ): boolean {
    return (
      !media.deletedAt &&
      media.moderationStatus === MediaModerationStatus.SAFE &&
      this.canMemberAccessMedia(media, requester) &&
      this.canMemberAccessMedia(media, taggedMember)
    );
  }

  canViewTags(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyId' | 'familyRole' | 'status'>,
  ): boolean {
    return !media.deletedAt && this.canMemberAccessMedia(media, member);
  }

  canRemoveTag(
    media: AlbumMediaPolicyResource,
    tag: AlbumMediaTagPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyRole'>,
  ): boolean {
    return (
      tag.taggedByMemberId === member.id ||
      tag.taggedMemberId === member.id ||
      media.uploadedByMemberId === member.id ||
      this.isManager(member)
    );
  }

  canEdit(media: AlbumMediaPolicyResource, member: Pick<FamilyMember, 'id'>) {
    return media.uploadedByMemberId === member.id;
  }

  canSoftDelete(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyRole'>,
  ) {
    return media.uploadedByMemberId === member.id || this.isManager(member);
  }

  canRestore(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyRole'>,
  ) {
    return this.canSoftDelete(media, member);
  }

  canPermanentDelete(
    media: AlbumMediaPolicyResource,
    member: Pick<FamilyMember, 'id' | 'familyRole'>,
  ) {
    return this.canSoftDelete(media, member);
  }

  private passesVisibility(
    media: AlbumMediaPolicyResource,
    isUploader: boolean,
    isManager: boolean,
  ): boolean {
    if (isUploader) return true;
    if (media.visibilityScope === AlbumVisibilityScope.FAMILY) return true;
    return (
      media.visibilityScope === AlbumVisibilityScope.MANAGER_ONLY && isManager
    );
  }
}
