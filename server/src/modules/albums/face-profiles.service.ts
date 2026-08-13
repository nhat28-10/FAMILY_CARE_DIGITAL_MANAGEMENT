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
  FaceDetectionBoundingBox,
  FaceEmbeddingExtractResult,
} from './face-ai-client.service';
import { FaceEmbeddingCryptoService } from './face-embedding-crypto.service';
import {
  FACE_ENROLLMENT_MAX_FILES,
  FACE_ENROLLMENT_MIN_FILES,
  getFaceEnrollmentFileIssue,
} from './face-enrollment.validator';

const FACE_ENROLLMENT_NOT_ENROLLABLE_CODE = 'FACE_IMAGES_NOT_ENROLLABLE';

export interface FaceEnrollmentValidationError {
  index: number;
  fileName: string;
  reason: string;
  reasonCode: string;
  faceCount?: number;
}

export interface FaceEnrollmentValidationResult {
  index: number;
  fileName: string;
  ok: boolean;
  faceCount?: number;
  detectionScore?: number;
  qualityScore?: number | null;
  boundingBox?: FaceDetectionBoundingBox;
  reason?: string;
  reasonCode?: string;
}

export interface FaceEnrollmentValidationResponse {
  total: number;
  passCount: number;
  canEnroll: boolean;
  minRequired: number;
  maxAllowed: number;
  results: FaceEnrollmentValidationResult[];
}

interface FaceEnrollmentAnalysis {
  result: FaceEnrollmentValidationResult;
  embedding?: FaceEmbeddingExtractResult;
}

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
    const validatedFiles = this.assertFaceEnrollmentFileCount(files);
    const analyses = await this.analyzeEnrollmentFiles(validatedFiles);
    this.throwIfNotEnoughEnrollable(analyses, true);
    const extracted = analyses
      .map((item) => item.embedding)
      .filter((item): item is FaceEmbeddingExtractResult => Boolean(item));
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

  async validate(
    workspaceId: string,
    memberId: string,
    requester: FamilyMember,
    files: UploadedFilePayload[] | undefined,
  ): Promise<FaceEnrollmentValidationResponse> {
    const target = await this.getActiveTarget(workspaceId, memberId);
    this.assertCanManageProfile(requester, target);
    const validatedFiles = this.assertFaceEnrollmentFileCount(files);
    const analyses = await this.analyzeEnrollmentFiles(validatedFiles);
    const results = analyses.map((item) => item.result);
    const passCount = results.filter((item) => item.ok).length;
    return {
      total: results.length,
      passCount,
      canEnroll: passCount >= FACE_ENROLLMENT_MIN_FILES,
      minRequired: FACE_ENROLLMENT_MIN_FILES,
      maxAllowed: FACE_ENROLLMENT_MAX_FILES,
      results,
    };
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

  private async analyzeEnrollmentFiles(
    files: UploadedFilePayload[],
  ): Promise<FaceEnrollmentAnalysis[]> {
    const analyses: FaceEnrollmentAnalysis[] = [];
    for (const [index, file] of files.entries()) {
      const fileName = file.originalname || `image-${index + 1}`;
      const issue = getFaceEnrollmentFileIssue(file);
      if (issue) {
        analyses.push({
          result: {
            index,
            fileName,
            ok: false,
            reason: issue.reason,
            reasonCode: issue.reasonCode,
          },
        });
        continue;
      }

      try {
        const detection = await this.faceAi.detectFaces(file);
        if (detection.faces.length !== 1) {
          analyses.push({
            result: {
              index,
              fileName,
              ok: false,
              faceCount: detection.faces.length,
              reason:
                detection.faces.length === 0
                  ? 'No face detected'
                  : 'Multiple faces detected',
              reasonCode:
                detection.faces.length === 0
                  ? 'NO_FACE_DETECTED'
                  : 'MULTIPLE_FACES_DETECTED',
            },
          });
          continue;
        }

        const face = detection.faces[0];
        const detectionScore = this.score(face.detectionScore);
        const qualityScore =
          face.qualityScore === null || face.qualityScore === undefined
            ? null
            : this.score(face.qualityScore);
        analyses.push({
          result: {
            index,
            fileName,
            ok: true,
            faceCount: 1,
            detectionScore,
            qualityScore,
            boundingBox: face.boundingBox,
          },
          embedding: {
            faceCount: 1,
            embedding: face.embedding,
            embeddingDimension: face.embeddingDimension,
            detectionScore,
            qualityScore,
            modelName: detection.modelName,
            modelVersion: detection.modelVersion,
          },
        });
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw error;
        }
        analyses.push({
          result: {
            index,
            fileName,
            ok: false,
            reason: 'Face image cannot be scanned',
            reasonCode: 'FACE_IMAGE_CANNOT_BE_SCANNED',
          },
        });
      }
    }
    return analyses;
  }

  private assertFaceEnrollmentFileCount(
    files: UploadedFilePayload[] | undefined,
  ) {
    if (
      !files ||
      files.length < FACE_ENROLLMENT_MIN_FILES ||
      files.length > FACE_ENROLLMENT_MAX_FILES
    ) {
      throw new BadRequestException('Face enrollment requires 3 to 5 images');
    }
    return files;
  }

  private throwIfNotEnoughEnrollable(
    analyses: FaceEnrollmentAnalysis[],
    includeErrors: boolean,
  ) {
    const errors = analyses
      .filter((item) => !item.result.ok)
      .map((item) => this.toValidationError(item.result));
    if (errors.length === 0) return;

    throw new BadRequestException({
      message: 'Some face images are not enrollable',
      code: FACE_ENROLLMENT_NOT_ENROLLABLE_CODE,
      ...(includeErrors ? { errors } : {}),
    });
  }

  private toValidationError(
    result: FaceEnrollmentValidationResult,
  ): FaceEnrollmentValidationError {
    return {
      index: result.index,
      fileName: result.fileName,
      reason: result.reason ?? 'Face image is not enrollable',
      reasonCode: result.reasonCode ?? 'FACE_IMAGE_NOT_ENROLLABLE',
      ...(typeof result.faceCount === 'number'
        ? { faceCount: result.faceCount }
        : {}),
    };
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
