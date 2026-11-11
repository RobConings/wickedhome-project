import { readUnitDefinitions, type UnitCatalogueInput, type UnitCatalogue } from "@/types/unit-catalogue";
import { db } from "../lib/db";
import { conflict, notFound } from "../lib/http";

export async function getUnitCatalogue(householdId: string): Promise<UnitCatalogue> {
  const row = await db.household.findUnique({ where: { id: householdId }, select: { unitDefinitions: true, unitDefinitionsUpdatedAt: true } });
  if (!row) throw notFound("Household not found");
  return { units: readUnitDefinitions(row.unitDefinitions), updatedAt: row.unitDefinitionsUpdatedAt?.toISOString() ?? null };
}

/** Shared by recipes, cooking and any caller converting household units. */
export async function listUnitDefinitions(householdId: string) {
  return (await getUnitCatalogue(householdId)).units;
}

export async function saveUnitCatalogue(householdId: string, input: UnitCatalogueInput): Promise<UnitCatalogue> {
  const updatedAt = new Date(Math.max(Date.now(), input.expectedUpdatedAt ? Date.parse(input.expectedUpdatedAt) + 1 : 0));
  const result = await db.household.updateMany({
    where: { id: householdId, unitDefinitionsUpdatedAt: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null },
    data: { unitDefinitions: input.units, unitDefinitionsUpdatedAt: updatedAt },
  });
  if (!result.count) throw conflict("The unit catalogue changed. Reload before saving.");
  return { units: input.units, updatedAt: updatedAt.toISOString() };
}
