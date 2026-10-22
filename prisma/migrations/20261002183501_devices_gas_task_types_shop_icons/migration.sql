-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('SENSOR', 'APPLIANCE', 'CLIMATE', 'ALARM', 'LIGHT', 'CAMERA', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceValueSource" AS ENUM ('MANUAL', 'HOME_ASSISTANT');

-- CreateEnum
CREATE TYPE "EnergyCarrier" AS ENUM ('ELECTRICITY', 'GAS', 'WATER');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CHORE', 'TODO', 'JOB', 'MAINTENANCE', 'ERRAND');

-- AlterEnum
ALTER TYPE "CalendarCategory" ADD VALUE 'HOLIDAY';

-- DropIndex
DROP INDEX "energy_meters_householdId_kind_idx";

-- AlterTable
ALTER TABLE "appliances" ADD COLUMN     "carriers" "EnergyCarrier"[] DEFAULT ARRAY['ELECTRICITY']::"EnergyCarrier"[];

-- AlterTable
ALTER TABLE "energy_intervals" ADD COLUMN     "calorificWhPerM3" INTEGER,
ADD COLUMN     "volumeLitres" INTEGER;

-- AlterTable
ALTER TABLE "energy_meter_readings" ADD COLUMN     "calorificWhPerM3" INTEGER,
ADD COLUMN     "valueLitres" INTEGER;

-- AlterTable
ALTER TABLE "energy_meters" ADD COLUMN     "carrier" "EnergyCarrier" NOT NULL DEFAULT 'ELECTRICITY';

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "kind",
ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'CHORE';

-- DropEnum
DROP TYPE "TaskKind";

-- CreateTable
CREATE TABLE "device_profiles" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" "DeviceCategory" NOT NULL,
    "fields" JSONB NOT NULL,
    "primaryField" TEXT,
    "rules" JSONB NOT NULL,
    "fallbackTone" TEXT NOT NULL DEFAULT 'neutral',
    "fallbackLabel" TEXT,
    "staleAfterMinutes" INTEGER,
    "presetKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "placeId" TEXT,
    "floorId" TEXT,
    "x" INTEGER,
    "y" INTEGER,
    "applianceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_field_values" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "source" "DeviceValueSource" NOT NULL DEFAULT 'MANUAL',
    "haEntityId" TEXT,
    "haAttribute" TEXT,
    "value" JSONB,
    "valueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_settings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "gasEan" TEXT,
    "gasCalorificWhPerM3" INTEGER NOT NULL DEFAULT 11400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_icons" (
    "shopId" TEXT NOT NULL,
    "contentType" TEXT,
    "data" BYTEA,
    "sourceUrl" TEXT,
    "websiteUrl" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,

    CONSTRAINT "shop_icons_pkey" PRIMARY KEY ("shopId")
);

-- CreateIndex
CREATE INDEX "device_profiles_householdId_idx" ON "device_profiles"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_applianceId_key" ON "devices"("applianceId");

-- CreateIndex
CREATE INDEX "devices_householdId_idx" ON "devices"("householdId");

-- CreateIndex
CREATE INDEX "devices_floorId_idx" ON "devices"("floorId");

-- CreateIndex
CREATE INDEX "devices_profileId_idx" ON "devices"("profileId");

-- CreateIndex
CREATE INDEX "device_field_values_haEntityId_idx" ON "device_field_values"("haEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "device_field_values_deviceId_fieldKey_key" ON "device_field_values"("deviceId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "energy_settings_householdId_key" ON "energy_settings"("householdId");

-- CreateIndex
CREATE INDEX "energy_meters_householdId_carrier_kind_idx" ON "energy_meters"("householdId", "carrier", "kind");

-- AddForeignKey
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "device_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_applianceId_fkey" FOREIGN KEY ("applianceId") REFERENCES "appliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_field_values" ADD CONSTRAINT "device_field_values_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_settings" ADD CONSTRAINT "energy_settings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_icons" ADD CONSTRAINT "shop_icons_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

