-- Keep uploaded covers; source photos are a separate, optional fallback.
ALTER TABLE "recipes" ADD COLUMN "imageUrl" TEXT;
