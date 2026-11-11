import { z } from "zod";
import { isPieceUnit, isStandardUnitSetting, normalizeUnit, standardUnits, unitDefinitionKey, unitInfo, type UnitDefinition } from "./units";

const decimal = (minimum: number) => z.preprocess((value) => typeof value === "string" ? value.replace(",", ".") : value, z.coerce.number().min(minimum).max(1_000_000));
export const unitDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(20),
  referenceUnit: z.string().trim().min(1).max(20),
  factor: decimal(0.00000001),
  rounding: decimal(0.001).default(1),
  aliases: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  isTerminal: z.boolean().optional(),
});

export const unitCatalogueInputSchema = z.object({
  expectedUpdatedAt: z.iso.datetime().nullable(),
  units: z.array(unitDefinitionSchema).max(100 + standardUnits().length).superRefine((definitions, ctx) => {
    if (definitions.filter((unit) => !isStandardUnitSetting(unit)).length > 100) ctx.addIssue({ code: "custom", message: "unitLimit" });
    const names = new Map<string, number>();
    for (const [index, definition] of definitions.entries()) {
      const standardSetting = isStandardUnitSetting(definition);
      for (const name of [definition.name, ...definition.aliases]) {
        const key = normalizeUnit(name);
        const identity = unitDefinitionKey(name);
        const native = unitInfo(name);
        // Reference measures keep their standard meaning. Container labels can be defined explicitly.
        if ((names.has(identity) && names.get(identity) !== index) || (!standardSetting && native && (native.dimension === "mass" || native.dimension === "volume" || isPieceUnit(key)))) ctx.addIssue({ code: "custom", path: [index, "name"], message: "unitNameConflict" });
        names.set(identity, index);
      }
      if (standardSetting) continue;
      const base = unitInfo(definition.referenceUnit);
      const customReference = definitions.some((item) => !isStandardUnitSetting(item) && [item.name, ...item.aliases].some((name) => unitDefinitionKey(name) === unitDefinitionKey(definition.referenceUnit)));
      if (!unitInfo(definition.name, definitions) || (!customReference && base?.dimension === "count" && !isPieceUnit(definition.referenceUnit))) ctx.addIssue({ code: "custom", path: [index, "referenceUnit"], message: "unitReferenceInvalid" });
    }
  }),
});
export type UnitCatalogueInput = z.infer<typeof unitCatalogueInputSchema>;
export type UnitCatalogue = { units: UnitDefinition[]; updatedAt: string | null; usedUnits?: string[] };

export function readUnitDefinitions(value: unknown): UnitDefinition[] {
  const parsed = z.array(unitDefinitionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}
