import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FaceProfileStatus,
  FamilyMember,
  FamilyRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { UploadedFilePayload } from '../storage/storage.service';
import {
  FaceAiClientService,
  FaceEmbeddingExtractResult,
} from './face-ai-client.service';
import { FaceEmbeddingCryptoService } from './face-embedding-crypto.service';
import { validateFaceEnrollmentFiles } from './face-enrollment.validator';

@Injectable()
export class FaceProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceAi: FaceAiClientService,
    private readonly crypto: FaceEmbeddingCryptoService,
  ) {}

  async enroll(
    workspaceId: string,
    memberId: string,
    requester: FamilyMember,
    files: UploadedFilePayload[] | undefined,
  ) {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const validatedFiles = validateFaceEnrollmentFiles(files);
    const extracted = await this.extractAll(validatedFiles);
    const prepared = this.prepareEmbeddings(extracted);
    const now = new Date();

    const profile = await this.prisma.$transaction(async (tx) => {
      const savedProfile = await tx.memberFaceProfile.upsert({
        where: { workspaceId_memberId: { workspaceId, memberId: target.id } },
        create: {
          workspaceId,
          memberId: target.id,
          status: FaceProfileStatus.ACTIVE,
          consentedAt: now,
          consentedByMemberId: requester.id,
          modelName: prepared[0].modelName,
          modelVersion: prepared[0].modelVersion,
          deletedAt: null,
        },
        update: {
          status: FaceProfileStatus.ACTIVE,
          consentedAt: now,
          consentedByMemberId: requester.id,
          modelName: prepared[0].modelName,
          modelVersion: prepared[0].modelVersion,
          deletedAt: null,
        },
      });

      await tx.memberFaceEmbedding.updateMany({
        where: { profileId: savedProfile.profileId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.memberFaceEmbedding.createMany({
        data: prepared.map((item) => ({
          profileId: savedProfile.profileId,
          encryptedEmbedding: item.encryptedEmbedding,
          encryptionIv: item.encryptionIv,
          encryptionAuthTag: item.encryptionAuthTag,
          embeddingDimension: item.embeddingDimension,
          detectionScore: item.detectionScore,
          qualityScore: item.qualityScore,
          modelName: item.modelName,
          modelVersion: item.modelVersion,
        })),
      });

      return savedProfile;
    });

    return this.toSummary(profile, prepared.length);
  }

  async getProfile(
    workspaceId: string,
    memberId: string,
    requester: FamilyMember,
  ) {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const profile = await this.prisma.memberFaceProfile.findUnique({
      where: { workspaceId_memberId: { workspaceId, memberId: target.id } },
      include: {
        embeddings: {
          where: { revokedAt: null },
          select: { embeddingId: true },
        },
      },
    });
    if (!profile) {
      return {
        memberId: target.id,
        status: FaceProfileStatus.DELETED,
        sampleCount: 0,
        modelName: null,
        modelVersion: null,
        consentedAt: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    return this.toSummary(profile, profile.embeddings.length);
  }

  async disable(
    workspaceId: string,
    memberId: string,
    requester: FamilyMember,
  ) {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const profile = await this.findUsableProfile(workspaceId, target.id);
    const updated = await this.prisma.memberFaceProfile.update({
      where: { profileId: profile.profileId },
      data: { status: FaceProfileStatus.DISABLED },
    });
    const sampleCount = await this.countActiveEmbeddings(updated.profileId);
    return this.toSummary(updated, sampleCount);
  }

  async enable(workspaceId: string, memberId: string, requester: FamilyMember) {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const profile = await this.findUsableProfile(workspaceId, target.id);
    const sampleCount = await this.countActiveEmbeddings(profile.profileId);
    if (sampleCount < 3) {
      throw new BadRequestException(
        'Face profile requires at least 3 active embeddings to enable',
      );
    }
    const updated = await this.prisma.memberFaceProfile.update({
      where: { profileId: profile.profileId },
      data: { status: FaceProfileStatus.ACTIVE },
    });
    return this.toSummary(updated, sampleCount);
  }

  async deleteProfile(
    workspaceId: string,
    memberId: string,
    requester: FamilyMember,
  ) {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const profile = await this.prisma.memberFaceProfile.findUnique({
      where: { workspaceId_memberId: { workspaceId, memberId: target.id } },
    });
    if (!profile) {
      return {
        memberId: target.id,
        status: FaceProfileStatus.DELETED,
        sampleCount: 0,
        modelName: null,
        modelVersion: null,
        consentedAt: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    const deletedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.memberFaceEmbedding.deleteMany({
        where: { profileId: profile.profileId },
      });
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "album_tag_suggestions"
          SET "status" = 'EXPIRED'::"AlbumTagSuggestionStatus",
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "workspace_id" = ${workspaceId}
            AND "suggested_member_id" = ${target.id}
            AND "status" = 'PENDING'::"AlbumTagSuggestionStatus"
        `,
      );
      return tx.memberFaceProfile.update({
        where: { profileId: profile.profileId },
        data: {
          status: FaceProfileStatus.DELETED,
          deletedAt,
        },
      });
    });
    return this.toSummary(updated, 0);
  }

  private async getActiveTarget(workspaceId: string, memberId: string) {
    const target = await this.prisma.familyMember.findFirst({
      where: { id: memberId, familyId: workspaceId },
    });
    if (!target) {
      throw new NotFoundException('Face profile member not found');
    }
    if (target.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException('Face profile member must be active');
    }
    return target;
  }

  private assertCanManageProfile(
    requester: FamilyMember,
    target: FamilyMember,
  ) {
    if (requester.id === target.id) return;
    if (
      requester.familyRole === FamilyRole.FAMILY_MANAGER ||
      requester.familyRole === FamilyRole.DEPUTY_MEMBER
    ) {
      return;
    }
    throw new ForbiddenException('You cannot manage this face profile');
  }

  private async extractAll(files: UploadedFilePayload[]) {
    const results: FaceEmbeddingExtractResult[] = [];
    for (let index = 0; index < files.length; index += 2) {
      const chunk = files.slice(index, index + 2);
      results.push(
        ...(await Promise.all(
          chunk.map((file) => this.faceAi.extractEmbedding(file)),
        )),
      );
    }
    return results;
  }

  private prepareEmbeddings(results: FaceEmbeddingExtractResult[]) {
    const dimension = results[0]?.embeddingDimension;
    const modelName = results[0]?.modelName;
    const modelVersion = results[0]?.modelVersion;
    if (!dimension || !modelName || !modelVersion) {
      throw new ServiceUnavailableException('Face AI response is incomplete');
    }

    return results.map((result) => {
      if (result.faceCount !== 1) {
        throw new BadRequestException(
          'Each face enrollment image must contain exactly one face',
        );
      }
      if (
        result.embeddingDimension !== dimension ||
        result.embedding.length !== dimension ||
        result.modelName !== modelName ||
        result.modelVersion !== modelVersion
      ) {
        throw new ServiceUnavailableException(
          'Face AI returned inconsistent embeddings',
        );
      }
      if (
        result.embedding.some(
          (value) => !Number.isFinite(value) || value < -1 || value > 1,
        )
      ) {
        throw new ServiceUnavailableException('Face AI embedding is invalid');
      }
      const encrypted = this.crypto.encryptEmbedding(result.embedding);
      return {
        ...encrypted,
        embeddingDimension: result.embeddingDimension,
        detectionScore: this.score(result.detectionScore),
        qualityScore:
          result.qualityScore === null || result.qualityScore === undefined
            ? null
            : this.score(result.qualityScore),
        modelName: result.modelName,
        modelVersion: result.modelVersion,
      };
    });
  }

  private async findUsableProfile(workspaceId: string, memberId: string) {
    const profile = await this.prisma.memberFaceProfile.findUnique({
      where: { workspaceId_memberId: { workspaceId, memberId } },
    });
    if (!profile || profile.status === FaceProfileStatus.DELETED) {
      throw new BadRequestException('Face profile is not enrolled');
    }
    return profile;
  }

  private countActiveEmbeddings(profileId: string) {
    return this.prisma.memberFaceEmbedding.count({
      where: { profileId, revokedAt: null },
    });
  }

  private score(value: number) {
    return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
  }

  private toSummary(
    profile: {
      memberId: string;
      status: FaceProfileStatus;
      modelName: string | null;
      modelVersion: string | null;
      consentedAt: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    },
    sampleCount: number,
  ) {
    return {
      memberId: profile.memberId,
      status: profile.status,
      sampleCount,
      modelName: profile.modelName,
      modelVersion: profile.modelVersion,
      consentedAt: profile.consentedAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
