-- AlterEnum
ALTER TYPE "SosResponseType" ADD VALUE 'ON_THE_WAY';

-- AlterTable
ALTER TABLE "family_members" ADD COLUMN     "location_sharing_enabled" BOOLEAN NOT NULL DEFAULT false;

