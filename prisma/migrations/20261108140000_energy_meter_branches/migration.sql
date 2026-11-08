-- Explicit inclusion prevents adding a whole circuit and its sub-meters twice.
ALTER TABLE "appliances" ADD COLUMN "parentApplianceId" TEXT;
CREATE INDEX "appliances_parentApplianceId_idx" ON "appliances"("parentApplianceId");
ALTER TABLE "appliances" ADD CONSTRAINT "appliances_parentApplianceId_fkey" FOREIGN KEY ("parentApplianceId") REFERENCES "appliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
