CREATE TABLE "recipe_categories" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  CONSTRAINT "recipe_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_categories_householdId_nameKey_key" ON "recipe_categories"("householdId", "nameKey");
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "recipes_categoryId_idx" ON "recipes"("categoryId");
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "recipe_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
