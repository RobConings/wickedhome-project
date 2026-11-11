import { isPieceUnit, standardUnits, unitDefinitionKey, unitInfo, type UnitDefinition, type UnitDimension } from "./units";

export type UnitOverviewItem = {
  name: string;
  aliases: string[];
  referenceUnit: string | null;
  factor: number;
  rounding: number;
  dimension: UnitDimension | null;
  source: "standard" | "custom" | "used";
  /** Containers without a definition have no relationship to other count units. */
  needsDefinition: boolean;
};

/** One canonical row per unit; custom definitions take precedence exactly as in unitInfo. */
export function unitOverview(definitions: readonly UnitDefinition[], usedUnits: readonly string[] = []): UnitOverviewItem[] {
  const customKeys = new Set(definitions.flatMap((unit) => [unit.name, ...unit.aliases].map(unitDefinitionKey)));
  const builtins = standardUnits().flatMap((unit): UnitOverviewItem[] => {
    const names = [unit.name, ...unit.aliases].filter((name) => !customKeys.has(unitDefinitionKey(name)));
    if (!names.length) return [];
    return [{ ...unit, name: names[0]!, aliases: names.slice(1), rounding: unit.dimension === "count" || unit.dimension === "bundle" ? 1 : 0.001, source: "standard", needsDefinition: unit.dimension === "count" && !isPieceUnit(unit.name) }];
  });
  const items: UnitOverviewItem[] = [...builtins, ...definitions.map((unit): UnitOverviewItem => ({ ...unit, dimension: unitInfo(unit.name, definitions)?.dimension ?? null, source: "custom", needsDefinition: false }))];
  const known = new Set(items.flatMap((unit) => [unit.name, ...unit.aliases].map(unitDefinitionKey)));
  for (const name of usedUnits.map((name) => name.trim()).filter(Boolean)) {
    if (!known.has(unitDefinitionKey(name))) {
      items.push({ name, aliases: [], referenceUnit: null, factor: 1, rounding: 1, dimension: null, source: "used", needsDefinition: true });
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
  const byName = new Map(items.flatMap((unit) => [unit.name, ...unit.aliases].map((name) => [unitDefinitionKey(name), unit] as const)));
  const unit = byName.get(unitDefinitionKey(name));
  if (!unit) return null;
  const chain = (start: UnitOverviewItem) => {
    const path: string[] = [];
    let current: UnitOverviewItem | undefined = start;
    let factor = 1;
    while (current) {
      if (path.includes(current.name)) return null;
      path.push(current.name);
      if (!current.referenceUnit) return { path, factor, root: current.name };
      factor *= current.factor;
      if (!Number.isFinite(factor) || factor <= 0) return null;
      current = byName.get(unitDefinitionKey(current.referenceUnit));
    }
    return null;
  };
  const source = chain(unit);
  const links = items.flatMap((target): UnitLink[] => {
    if (!source || target.name === unit.name) return [];
    const destination = chain(target);
    if (!destination || destination.root !== source.root) return [];
    const factor = source.factor / destination.factor;
    if (!Number.isFinite(factor) || factor <= 0) return [];
    const common = source.path.findIndex((name) => destination.path.includes(name));
    const path = [...source.path.slice(0, common + 1), ...destination.path.slice(0, destination.path.indexOf(source.path[common]!)).reverse()];
    return [{ unit: target, factor, path, direct: path.length === 2 }];
  });
  return { unit, links };
}
