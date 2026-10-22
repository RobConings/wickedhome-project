-- CreateEnum
CREATE TYPE "HouseholdLocationSource" AS ENUM ('GEOPUNT', 'NOMINATIM', 'MANUAL');

-- CreateEnum
CREATE TYPE "WasteFraction" AS ENUM ('RESIDUAL', 'ORGANIC', 'PMD', 'PAPER', 'GLASS', 'TEXTILE', 'GARDEN', 'BULKY', 'OTHER');

-- CreateEnum
CREATE TYPE "WasteSyncStatus" AS ENUM ('OK', 'ERROR');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "addressBox" TEXT,
ADD COLUMN     "addressCountry" TEXT NOT NULL DEFAULT 'BE',
ADD COLUMN     "addressMunicipality" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressPostalCode" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationSource" "HouseholdLocationSource",
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "waste_setups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "addressLabel" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "WasteSyncStatus",
    "lastSyncError" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_collections" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fraction" "WasteFraction" NOT NULL,
    "providerKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waste_setups_householdId_key" ON "waste_setups"("householdId");

-- CreateIndex
CREATE INDEX "waste_collections_householdId_date_idx" ON "waste_collections"("householdId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "waste_collections_householdId_date_providerKey_key" ON "waste_collections"("householdId", "date", "providerKey");

-- AddForeignKey
ALTER TABLE "waste_setups" ADD CONSTRAINT "waste_setups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_collections" ADD CONSTRAINT "waste_collections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

