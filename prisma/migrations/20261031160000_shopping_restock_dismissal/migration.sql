CREATE TYPE "ShoppingRestockState" AS ENUM ('ACTIVE', 'DISMISSED', 'RESTOCKED');

ALTER TABLE "products" ADD COLUMN "shoppingRestockState" "ShoppingRestockState" NOT NULL DEFAULT 'ACTIVE';
