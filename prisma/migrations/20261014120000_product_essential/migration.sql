-- Existing products stay non-essential until the household marks them otherwise.
ALTER TABLE "products" ADD COLUMN "isEssential" BOOLEAN NOT NULL DEFAULT false;
