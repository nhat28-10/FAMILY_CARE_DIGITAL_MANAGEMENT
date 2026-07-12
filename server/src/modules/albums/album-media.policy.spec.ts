import {
  AlbumVisibilityScope,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
} from '@prisma/client';

import {
  AlbumMediaPolicy,
  AlbumMediaPolicyResource,
} from './album-media.policy';

const familyId = 'family-1';
const uploaderId = 'member-1';

function media(
  visibilityScope: AlbumVisibilityScope,
  moderationStatus: MediaModerationStatus,
): AlbumMediaPolicyResource {
  return {
    workspaceId: familyId,
    uploadedByMemberId: uploaderId,
    visibilityScope,
    moderationStatus,
  };
}

function member(id: string, familyRole: FamilyRole, memberFamilyId = familyId) {
  return {
    id,
    familyId: memberFamilyId,
    familyRole,
    status: MemberStatus.ACTIVE,
  };
}

describe('AlbumMediaPolicy', () => {
  const policy = new AlbumMediaPolicy();
  const uploader = member(uploaderId, FamilyRole.FAMILY_MEMBER);
  const normal = member('member-2', FamilyRole.FAMILY_MEMBER);
  const manager = member('manager', FamilyRole.FAMILY_MANAGER);
  const deputy = member('deputy', FamilyRole.DEPUTY_MEMBER);

  it('allows FAMILY SAFE for members in the family', () => {
    expect(
      policy.canViewFile(
        media(AlbumVisibilityScope.FAMILY, MediaModerationStatus.SAFE),
        normal,
      ),
    ).toBe(true);
  });

  it('limits PRIVATE SAFE to uploader', () => {
    const resource = media(
      AlbumVisibilityScope.PRIVATE,
      MediaModerationStatus.SAFE,
    );
    expect(policy.canViewFile(resource, uploader)).toBe(true);
    expect(policy.canViewFile(resource, manager)).toBe(false);
  });

  it('allows MANAGER_ONLY SAFE for uploader, manager and deputy', () => {
    const resource = media(
      AlbumVisibilityScope.MANAGER_ONLY,
      MediaModerationStatus.SAFE,
    );
    expect(policy.canViewFile(resource, uploader)).toBe(true);
    expect(policy.canViewFile(resource, manager)).toBe(true);
    expect(policy.canViewFile(resource, deputy)).toBe(true);
    expect(policy.canViewFile(resource, normal)).toBe(false);
  });

  it.each([MediaModerationStatus.PENDING, MediaModerationStatus.PROCESSING])(
    'lets uploader and managers access %s regardless of visibility',
    (status) => {
      const resource = media(AlbumVisibilityScope.PRIVATE, status);
      expect(policy.canViewFile(resource, uploader)).toBe(true);
      expect(policy.canViewFile(resource, manager)).toBe(true);
      expect(policy.canViewFile(resource, deputy)).toBe(true);
      expect(policy.canViewMetadata(resource, normal)).toBe(false);
    },
  );

  it('returns NEED_REVIEW metadata but no file to uploader', () => {
    const resource = media(
      AlbumVisibilityScope.FAMILY,
      MediaModerationStatus.NEED_REVIEW,
    );
    expect(policy.canViewMetadata(resource, uploader)).toBe(true);
    expect(policy.canViewFile(resource, uploader)).toBe(false);
    expect(policy.canViewFile(resource, manager)).toBe(true);
    expect(policy.canViewFile(resource, deputy)).toBe(true);
  });

  it('returns FLAGGED metadata but no file to uploader', () => {
    const resource = media(
      AlbumVisibilityScope.FAMILY,
      MediaModerationStatus.FLAGGED,
    );
    expect(policy.canViewMetadata(resource, uploader)).toBe(true);
    expect(policy.canViewFile(resource, uploader)).toBe(false);
    expect(policy.canViewFile(resource, manager)).toBe(true);
    expect(policy.canViewMetadata(resource, normal)).toBe(false);
  });

  it('denies cross-family access', () => {
    expect(
      policy.canViewMetadata(
        media(AlbumVisibilityScope.FAMILY, MediaModerationStatus.SAFE),
        member('other', FamilyRole.FAMILY_MANAGER, 'family-2'),
      ),
    ).toBe(false);
  });

  it('allows tags only when both members can access a SAFE active media', () => {
    const familyMedia = media(
      AlbumVisibilityScope.FAMILY,
      MediaModerationStatus.SAFE,
    );
    expect(policy.canCreateTag(familyMedia, normal, uploader)).toBe(true);
    expect(
      policy.canCreateTag(
        { ...familyMedia, deletedAt: new Date() },
        normal,
        uploader,
      ),
    ).toBe(false);
    expect(
      policy.canCreateTag(
        media(AlbumVisibilityScope.FAMILY, MediaModerationStatus.PENDING),
        normal,
        uploader,
      ),
    ).toBe(false);
  });

  it('enforces PRIVATE and MANAGER_ONLY access for tagged members', () => {
    const privateMedia = media(
      AlbumVisibilityScope.PRIVATE,
      MediaModerationStatus.SAFE,
    );
    expect(policy.canCreateTag(privateMedia, uploader, uploader)).toBe(true);
    expect(policy.canCreateTag(privateMedia, uploader, manager)).toBe(false);

    const managerMedia = media(
      AlbumVisibilityScope.MANAGER_ONLY,
      MediaModerationStatus.SAFE,
    );
    expect(policy.canCreateTag(managerMedia, manager, deputy)).toBe(true);
    expect(policy.canCreateTag(managerMedia, manager, normal)).toBe(false);
  });

  it('allows only tag participant, uploader, manager or deputy to remove', () => {
    const resource = media(
      AlbumVisibilityScope.FAMILY,
      MediaModerationStatus.SAFE,
    );
    const tag = {
      taggedMemberId: 'tagged',
      taggedByMemberId: 'creator',
    };
    expect(
      policy.canRemoveTag(
        resource,
        tag,
        member('creator', FamilyRole.FAMILY_MEMBER),
      ),
    ).toBe(true);
    expect(
      policy.canRemoveTag(
        resource,
        tag,
        member('tagged', FamilyRole.FAMILY_MEMBER),
      ),
    ).toBe(true);
    expect(policy.canRemoveTag(resource, tag, uploader)).toBe(true);
    expect(policy.canRemoveTag(resource, tag, manager)).toBe(true);
    expect(policy.canRemoveTag(resource, tag, deputy)).toBe(true);
    expect(policy.canRemoveTag(resource, tag, normal)).toBe(false);
  });
});
