-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADULT', 'CHILD');

-- CreateEnum
CREATE TYPE "BillCategory" AS ENUM ('ENERGY', 'WATER', 'INTERNET_PHONE', 'INSURANCE', 'TAXES', 'HOUSING', 'HEALTHCARE', 'SCHOOL_CHILDCARE', 'CAR', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('EVENT', 'STORE_VISIT');

-- CreateEnum
CREATE TYPE "CalendarCategory" AS ENUM ('FAMILY', 'SCHOOL', 'WORK', 'HEALTH', 'SOCIAL', 'SPORT', 'HOUSEHOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStorageProvider" AS ENUM ('LOCAL', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "ApplianceCategory" AS ENUM ('HEATING', 'HEAT_PUMP', 'COOKING', 'LAUNDRY', 'DISHWASHER', 'COLD', 'JACUZZI_POOL', 'EV_CHARGER', 'IT_MEDIA', 'LIGHTING', 'TOOLS', 'OTHER');

-- CreateEnum
CREATE TYPE "EnergyMeterKind" AS ENUM ('GRID_IMPORT', 'GRID_EXPORT', 'SOLAR_PRODUCTION', 'BATTERY_CHARGE', 'BATTERY_DISCHARGE', 'APPLIANCE');

-- CreateEnum
CREATE TYPE "EnergyRegister" AS ENUM ('SINGLE', 'DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "EnergySource" AS ENUM ('MANUAL', 'FLUVIUS_CSV', 'HOME_ASSISTANT');

-- CreateEnum
CREATE TYPE "EnergyIntervalStatus" AS ENUM ('VALIDATED', 'ESTIMATED', 'NO_USAGE', 'MEASURED');

-- CreateEnum
CREATE TYPE "HabitantType" AS ENUM ('ADULT', 'CHILD', 'PET', 'GUEST');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('SCAN_USE', 'SCAN_ADD', 'BOUGHT', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "FloorKind" AS ENUM ('INDOOR', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('ROOM', 'ZONE');

-- CreateEnum
CREATE TYPE "PlanElementKind" AS ENUM ('WALL', 'DOOR', 'WINDOW');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PRODUCE', 'BAKERY', 'DAIRY', 'MEAT_FISH', 'PANTRY', 'FROZEN', 'DRINKS', 'HOUSEHOLD', 'PERSONAL_CARE', 'BABY', 'PETS', 'PHARMACY', 'DIY', 'GARDEN', 'OTHER');

-- CreateEnum
CREATE TYPE "ShoppingListKind" AS ENUM ('GROCERIES', 'DIY', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "ShoppingItemSource" AS ENUM ('MANUAL', 'STAPLE', 'TASK', 'LOW_STOCK');

-- CreateEnum
CREATE TYPE "ShoppingItemStatus" AS ENUM ('OPEN', 'BOUGHT');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('SUPERMARKET', 'DISCOUNT', 'DIY', 'GARDEN', 'HOME', 'ELECTRONICS', 'PHARMACY', 'DRUGSTORE', 'PETS', 'SPORTS', 'FASHION', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'MONTHS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('PHYSICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskOutcome" AS ENUM ('DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_series" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "category" "BillCategory" NOT NULL,
    "rrule" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "structuredCommunication" TEXT,
    "iban" TEXT,
    "notes" TEXT,
    "generatedUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "seriesId" TEXT,
    "payee" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "category" "BillCategory" NOT NULL,
    "structuredCommunication" TEXT,
    "iban" TEXT,
    "notes" TEXT,
    "paidOn" DATE,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_shares" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "bill_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_series_shares" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "bill_series_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'EVENT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "category" "CalendarCategory",
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "rrule" TEXT,
    "shopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_participants" (
    "eventId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "calendar_event_participants_pkey" PRIMARY KEY ("eventId","habitantId")
);

-- CreateTable
CREATE TABLE "document_folders" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT,
    "externalId" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appliances" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placeId" TEXT,
    "category" "ApplianceCategory" NOT NULL,
    "ratedPowerW" INTEGER,
    "standbyPowerW" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solar_installations" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "panelCount" INTEGER NOT NULL,
    "panelWp" INTEGER NOT NULL,
    "azimuthDeg" INTEGER,
    "tiltDeg" INTEGER,
    "inverterBrand" TEXT,
    "inverterModel" TEXT,
    "installedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solar_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_batteries" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityWh" INTEGER NOT NULL,
    "maxChargeW" INTEGER,
    "maxDischargeW" INTEGER,
    "installedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_batteries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_meters" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EnergyMeterKind" NOT NULL,
    "register" "EnergyRegister" NOT NULL DEFAULT 'SINGLE',
    "source" "EnergySource" NOT NULL,
    "ean" TEXT,
    "applianceId" TEXT,
    "solarInstallationId" TEXT,
    "batteryId" TEXT,
    "haStatisticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_intervals" (
    "id" BIGSERIAL NOT NULL,
    "meterId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "energyWh" INTEGER NOT NULL,
    "status" "EnergyIntervalStatus" NOT NULL,

    CONSTRAINT "energy_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_meter_readings" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL,
    "valueWh" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habitants" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HabitantType" NOT NULL,
    "color" TEXT NOT NULL,
    "emoji" TEXT,
    "birthday" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habitants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "minQuantity" DECIMAL(12,3),
    "expiresOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "delta" DECIMAL(12,3) NOT NULL,
    "quantityAfter" DECIMAL(12,3) NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "userId" TEXT,
    "shoppingItemId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "kind" "FloorKind" NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlaceKind" NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "polygon" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_elements" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "kind" "PlanElementKind" NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recent_selections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'OTHER',
    "defaultShopId" TEXT,
    "barcode" TEXT,
    "qrCode" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_shop_links" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "url" TEXT,
    "priceCents" INTEGER,
    "articleNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_shop_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ShoppingListKind" NOT NULL,
    "defaultSource" "ShoppingItemSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_staples" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "shopId" TEXT,
    "rrule" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "nextDueOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_staples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_items" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "shopId" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "priceCents" INTEGER,
    "note" TEXT,
    "placeId" TEXT,
    "source" "ShoppingItemSource" NOT NULL DEFAULT 'MANUAL',
    "taskId" TEXT,
    "stapleId" TEXT,
    "status" "ShoppingItemStatus" NOT NULL DEFAULT 'OPEN',
    "boughtAt" TIMESTAMP(3),
    "boughtByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "catalogKey" TEXT,
    "name" TEXT NOT NULL,
    "type" "ShopType" NOT NULL,
    "address" TEXT,
    "websiteUrl" TEXT,
    "hasWebshop" BOOLEAN NOT NULL DEFAULT false,
    "openingHours" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "costCents" INTEGER NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "cycleMonths" INTEGER,
    "nextRenewalOn" DATE NOT NULL,
    "paymentMethod" TEXT,
    "ownerId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "trialEndsOn" DATE,
    "remindDaysBefore" INTEGER,
    "candidateToCancel" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "kind" "TaskKind" NOT NULL DEFAULT 'PHYSICAL',
    "placeId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "estimatedMinutes" INTEGER,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE,
    "rrule" TEXT,
    "recurrenceStart" DATE,
    "occurrenceDate" DATE,
    "rotateAssignees" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "taskId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","habitantId")
);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_completions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "outcome" "TaskOutcome" NOT NULL,
    "occurrenceDate" DATE,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "note" TEXT,

    CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_habitantId_key" ON "users"("habitantId");

-- CreateIndex
CREATE INDEX "users_householdId_idx" ON "users"("householdId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "bill_series_householdId_idx" ON "bill_series"("householdId");

-- CreateIndex
CREATE INDEX "bills_householdId_dueDate_idx" ON "bills"("householdId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "bills_seriesId_dueDate_key" ON "bills"("seriesId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "bill_shares_billId_habitantId_key" ON "bill_shares"("billId", "habitantId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_series_shares_seriesId_habitantId_key" ON "bill_series_shares"("seriesId", "habitantId");

-- CreateIndex
CREATE INDEX "calendar_events_householdId_startDate_idx" ON "calendar_events"("householdId", "startDate");

-- CreateIndex
CREATE INDEX "calendar_events_shopId_idx" ON "calendar_events"("shopId");

-- CreateIndex
CREATE INDEX "calendar_event_participants_habitantId_idx" ON "calendar_event_participants"("habitantId");

-- CreateIndex
CREATE INDEX "document_folders_householdId_parentId_idx" ON "document_folders"("householdId", "parentId");

-- CreateIndex
CREATE INDEX "document_folders_householdId_deletedAt_idx" ON "document_folders"("householdId", "deletedAt");

-- CreateIndex
CREATE INDEX "document_files_householdId_folderId_idx" ON "document_files"("householdId", "folderId");

-- CreateIndex
CREATE INDEX "document_files_householdId_deletedAt_idx" ON "document_files"("householdId", "deletedAt");

-- CreateIndex
CREATE INDEX "document_links_householdId_entityType_entityId_idx" ON "document_links"("householdId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_fileId_entityType_entityId_key" ON "document_links"("fileId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "appliances_householdId_idx" ON "appliances"("householdId");

-- CreateIndex
CREATE INDEX "appliances_placeId_idx" ON "appliances"("placeId");

-- CreateIndex
CREATE INDEX "solar_installations_householdId_idx" ON "solar_installations"("householdId");

-- CreateIndex
CREATE INDEX "home_batteries_householdId_idx" ON "home_batteries"("householdId");

-- CreateIndex
CREATE INDEX "energy_meters_householdId_kind_idx" ON "energy_meters"("householdId", "kind");

-- CreateIndex
CREATE INDEX "energy_meters_applianceId_idx" ON "energy_meters"("applianceId");

-- CreateIndex
CREATE INDEX "energy_intervals_meterId_endAt_idx" ON "energy_intervals"("meterId", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "energy_intervals_meterId_startAt_endAt_key" ON "energy_intervals"("meterId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "energy_meter_readings_meterId_readAt_key" ON "energy_meter_readings"("meterId", "readAt");

-- CreateIndex
CREATE INDEX "habitants_householdId_idx" ON "habitants"("householdId");

-- CreateIndex
CREATE INDEX "stock_items_householdId_idx" ON "stock_items"("householdId");

-- CreateIndex
CREATE INDEX "stock_items_placeId_idx" ON "stock_items"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_productId_placeId_key" ON "stock_items"("productId", "placeId");

-- CreateIndex
CREATE INDEX "stock_movements_stockItemId_createdAt_idx" ON "stock_movements"("stockItemId", "createdAt");

-- CreateIndex
CREATE INDEX "floors_householdId_idx" ON "floors"("householdId");

-- CreateIndex
CREATE INDEX "places_householdId_idx" ON "places"("householdId");

-- CreateIndex
CREATE INDEX "places_floorId_idx" ON "places"("floorId");

-- CreateIndex
CREATE INDEX "plan_elements_floorId_idx" ON "plan_elements"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_entityType_entityId_key" ON "favorites"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "recent_selections_userId_entityType_lastUsedAt_idx" ON "recent_selections"("userId", "entityType", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recent_selections_userId_entityType_entityId_key" ON "recent_selections"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "products_householdId_idx" ON "products"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "products_householdId_barcode_key" ON "products"("householdId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_householdId_qrCode_key" ON "products"("householdId", "qrCode");

-- CreateIndex
CREATE INDEX "product_shop_links_shopId_idx" ON "product_shop_links"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "product_shop_links_productId_shopId_key" ON "product_shop_links"("productId", "shopId");

-- CreateIndex
CREATE INDEX "shopping_lists_householdId_idx" ON "shopping_lists"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_lists_householdId_defaultSource_key" ON "shopping_lists"("householdId", "defaultSource");

-- CreateIndex
CREATE INDEX "shopping_staples_householdId_nextDueOn_idx" ON "shopping_staples"("householdId", "nextDueOn");

-- CreateIndex
CREATE INDEX "shopping_items_householdId_status_idx" ON "shopping_items"("householdId", "status");

-- CreateIndex
CREATE INDEX "shopping_items_listId_idx" ON "shopping_items"("listId");

-- CreateIndex
CREATE INDEX "shopping_items_shopId_idx" ON "shopping_items"("shopId");

-- CreateIndex
CREATE INDEX "shopping_items_taskId_idx" ON "shopping_items"("taskId");

-- CreateIndex
CREATE INDEX "shopping_items_productId_idx" ON "shopping_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "shops_catalogKey_key" ON "shops"("catalogKey");

-- CreateIndex
CREATE INDEX "shops_householdId_idx" ON "shops"("householdId");

-- CreateIndex
CREATE INDEX "subscriptions_householdId_idx" ON "subscriptions"("householdId");

-- CreateIndex
CREATE INDEX "tasks_householdId_status_dueDate_idx" ON "tasks"("householdId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "tasks_placeId_idx" ON "tasks"("placeId");

-- CreateIndex
CREATE INDEX "task_assignees_habitantId_idx" ON "task_assignees"("habitantId");

-- CreateIndex
CREATE INDEX "task_checklist_items_taskId_idx" ON "task_checklist_items"("taskId");

-- CreateIndex
CREATE INDEX "task_completions_taskId_completedAt_idx" ON "task_completions"("taskId", "completedAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_series" ADD CONSTRAINT "bill_series_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "bill_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_shares" ADD CONSTRAINT "bill_shares_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_shares" ADD CONSTRAINT "bill_shares_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_series_shares" ADD CONSTRAINT "bill_series_shares_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "bill_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_series_shares" ADD CONSTRAINT "bill_series_shares_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "document_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appliances" ADD CONSTRAINT "appliances_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appliances" ADD CONSTRAINT "appliances_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solar_installations" ADD CONSTRAINT "solar_installations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_batteries" ADD CONSTRAINT "home_batteries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_meters" ADD CONSTRAINT "energy_meters_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_meters" ADD CONSTRAINT "energy_meters_applianceId_fkey" FOREIGN KEY ("applianceId") REFERENCES "appliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_meters" ADD CONSTRAINT "energy_meters_solarInstallationId_fkey" FOREIGN KEY ("solarInstallationId") REFERENCES "solar_installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_meters" ADD CONSTRAINT "energy_meters_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "home_batteries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_intervals" ADD CONSTRAINT "energy_intervals_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "energy_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_meter_readings" ADD CONSTRAINT "energy_meter_readings_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "energy_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habitants" ADD CONSTRAINT "habitants_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_elements" ADD CONSTRAINT "plan_elements_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_elements" ADD CONSTRAINT "plan_elements_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_selections" ADD CONSTRAINT "recent_selections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_defaultShopId_fkey" FOREIGN KEY ("defaultShopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_shop_links" ADD CONSTRAINT "product_shop_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_shop_links" ADD CONSTRAINT "product_shop_links_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_staples" ADD CONSTRAINT "shopping_staples_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_staples" ADD CONSTRAINT "shopping_staples_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_staples" ADD CONSTRAINT "shopping_staples_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_staples" ADD CONSTRAINT "shopping_staples_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_stapleId_fkey" FOREIGN KEY ("stapleId") REFERENCES "shopping_staples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
