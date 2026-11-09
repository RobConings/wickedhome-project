-- Preserve receipts, acquisitions and paid expenses while removing a visit from the shopping UI.
ALTER TYPE "ShoppingSessionStatus" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TABLE "shopping_sessions" ADD COLUMN "deletedAt" TIMESTAMP(3);
