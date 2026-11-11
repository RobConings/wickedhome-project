import { unitConnections, unitDefinitionKey, unitNodes, type UnitDefinition, type UnitNode } from "./units";

export type UnitOverviewItem = Omit<UnitNode, "source"> & { source: "standard" | "custom" | "used" };

/** One canonical row per unit; custom definitions take precedence exactly as in unitInfo. */
export function unitOverview(definitions: readonly UnitDefinition[], usedUnits: readonly string[] = []): UnitOverviewItem[] {
  const items: UnitOverviewItem[] = unitNodes(definitions);
  const known = new Set(items.flatMap((unit) => [unit.name, ...unit.aliases].map(unitDefinitionKey)));
  for (const name of usedUnits.map((name) => name.trim()).filter(Boolean)) {
    if (!known.has(unitDefinitionKey(name))) {
      items.push({ name, aliases: [], referenceUnit: null, factor: 1, rounding: 1, dimension: null, source: "used", needsDefinition: true, isTerminal: false });
      known.add(unitDefinitionKey(name));
    }
  }
  return items;
}

export const findOverviewUnit = (name: string, items: readonly UnitOverviewItem[]) => items.find((unit) => [unit.name, ...unit.aliases].some((alias) => unitDefinitionKey(alias) === unitDefinitionKey(name)));

export type UnitLink = { unit: UnitOverviewItem; /** Target units per one source unit, without purchase rounding. */ factor: number; path: string[]; direct: boolean };

/** Follow references in either direction through their common ancestor, with cycle/overflow guards. */
export function linkedUnits(name: string, definitions: readonly UnitDefinition[], usedUnits: readonly string[] = []): { unit: UnitOverviewItem; links: UnitLink[] } | null {
  const items = unitOverview(definitions, usedUnits);
  const unit = findOverviewUnit(name, items);
  if (!unit) return null;
  return { unit, links: unitConnections(name, definitions)?.links ?? [] };
}
