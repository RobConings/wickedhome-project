import { readUnitDefinitions, type UnitCatalogueInput, type UnitCatalogue } from "@/types/unit-catalogue";
import { db } from "../lib/db";
import { conflict, notFound } from "../lib/http";

export async function getUnitCatalogue(householdId: string): Promise<UnitCatalogue> {
  const row = await db.household.findUnique({ where: { id: householdId }, select: { unitDefinitions: true, unitDefinitionsUpdatedAt: true } });
  if (!row) throw notFound("Household not found");
  return { units: readUnitDefinitions(row.unitDefinitions), updatedAt: row.unitDefinitionsUpdatedAt?.toISOString() ?? null };
}

/** Read-only names already used by this household; no ratios are inferred from usage. */
export async function getUnitCatalogueOverview(householdId: string): Promise<UnitCatalogue> {
  const [catalogue, products, stock, ingredients, shopping, staples, extras, sessionItems, purchases] = await Promise.all([
    getUnitCatalogue(householdId),
    db.product.groupBy({ by: ["unit", "packageUnit"], where: { householdId } }),
    db.stockItem.groupBy({ by: ["unit"], where: { householdId } }),
    db.recipeIngredient.groupBy({ by: ["unit"], where: { recipe: { householdId } } }),
    db.shoppingItem.groupBy({ by: ["unit"], where: { householdId } }),
    db.shoppingStaple.groupBy({ by: ["unit"], where: { householdId } }),
    db.cookExtraIngredient.groupBy({ by: ["unit"], where: { entry: { householdId } } }),
    db.shoppingSessionItem.groupBy({ by: ["unit"], where: { session: { householdId } } }),
    db.stockPurchase.groupBy({ by: ["unit", "purchasedUnit"], where: { householdId } }),
  ]);
  const names = [...products.flatMap((row) => [row.unit, row.packageUnit]), ...[stock, ingredients, shopping, staples, extras, sessionItems].flatMap((rows) => rows.map((row) => row.unit)), ...purchases.flatMap((row) => [row.unit, row.purchasedUnit])];
  return { ...catalogue, usedUnits: [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))].sort() };
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
