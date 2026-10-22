-- CreateEnum
CREATE TYPE "GoogleDriveFolderMode" AS ENUM ('CREATED', 'PICKED');

-- AlterTable
ALTER TABLE "document_files" ADD COLUMN     "pendingTarget" TEXT,
ADD COLUMN     "targetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetError" TEXT,
ADD COLUMN     "targetNextAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "google_drive_storage_targets" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "folderMode" "GoogleDriveFolderMode" NOT NULL,
    "yearSubfolders" BOOLEAN NOT NULL DEFAULT true,
    "yearFolders" JSONB NOT NULL DEFAULT '{}',
    "deleteInDrive" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastMovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_storage_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_drive_storage_targets_userId_idx" ON "google_drive_storage_targets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_storage_targets_householdId_kind_key" ON "google_drive_storage_targets"("householdId", "kind");

-- CreateIndex
CREATE INDEX "document_files_pendingTarget_targetNextAttemptAt_idx" ON "document_files"("pendingTarget", "targetNextAttemptAt");

-- AddForeignKey
ALTER TABLE "google_drive_storage_targets" ADD CONSTRAINT "google_drive_storage_targets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_storage_targets" ADD CONSTRAINT "google_drive_storage_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

