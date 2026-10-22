-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('OPEN', 'COOKING', 'COOKED');

-- AlterEnum
ALTER TYPE "ShoppingItemSource" ADD VALUE 'RECIPE';

-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'COOKED';

-- AlterTable
ALTER TABLE "shopping_items" ADD COLUMN     "mealPlanEntryId" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "mealPlanEntryId" TEXT;

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "servings" INTEGER,
    "sourceUrl" TEXT,
    "coverFileId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "note" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_steps" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "timerMinutes" INTEGER,

    CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_entries" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "servings" INTEGER NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'OPEN',
    "addedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "cookedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_extra_ingredients" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "savedToRecipe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_extra_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_usages" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "extraId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "movementId" TEXT,
    "userId" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipes_householdId_name_idx" ON "recipes"("householdId", "name");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipeId_position_idx" ON "recipe_ingredients"("recipeId", "position");

-- CreateIndex
CREATE INDEX "recipe_ingredients_productId_idx" ON "recipe_ingredients"("productId");

-- CreateIndex
CREATE INDEX "recipe_steps_recipeId_position_idx" ON "recipe_steps"("recipeId", "position");

-- CreateIndex
CREATE INDEX "meal_plan_entries_householdId_status_idx" ON "meal_plan_entries"("householdId", "status");

-- CreateIndex
CREATE INDEX "meal_plan_entries_recipeId_idx" ON "meal_plan_entries"("recipeId");

-- CreateIndex
CREATE INDEX "cook_extra_ingredients_entryId_idx" ON "cook_extra_ingredients"("entryId");

-- CreateIndex
CREATE INDEX "cook_usages_entryId_idx" ON "cook_usages"("entryId");

-- CreateIndex
CREATE INDEX "shopping_items_mealPlanEntryId_idx" ON "shopping_items"("mealPlanEntryId");

-- CreateIndex
CREATE INDEX "stock_movements_mealPlanEntryId_idx" ON "stock_movements"("mealPlanEntryId");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_extra_ingredients" ADD CONSTRAINT "cook_extra_ingredients_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "meal_plan_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_extra_ingredients" ADD CONSTRAINT "cook_extra_ingredients_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_usages" ADD CONSTRAINT "cook_usages_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "meal_plan_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_usages" ADD CONSTRAINT "cook_usages_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "cook_extra_ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
