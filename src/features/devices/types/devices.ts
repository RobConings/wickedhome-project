import { z } from "zod";
import { hexColorSchema, idSchema } from "@/types/common";
import { canManageHousehold } from "@/types/roles";

// Devices: things with a state and a place, shown as coloured indicators on the floor plan.
// A *profile* (household-level type) defines the fields and the indicator rules; a *device* uses a profile,
// sits in a place and optionally on the plan, and has one value (with its source binding) per field.
// See docs/DEVICES.md.

export const DEVICE_CATEGORIES = ["sensor", "appliance", "climate", "alarm", "light", "camera", "other"] as const;
export const deviceCategorySchema = z.enum(DEVICE_CATEGORIES);
export type DeviceCategory = z.infer<typeof deviceCategorySchema>;

export const FIELD_TYPES = ["boolean", "number", "text", "choice"] as const;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const RULE_OPERATORS = ["is_true", "is_false", "eq", "neq", "gt", "gte", "lt", "lte", "between", "in"] as const;
export const ruleOperatorSchema = z.enum(RULE_OPERATORS);
export type RuleOperator = z.infer<typeof ruleOperatorSchema>;

/** Which operators make sense for a field type (the profile editor offers only these). */
export const OPERATORS_BY_TYPE: Record<FieldType, readonly RuleOperator[]> = {
  boolean: ["is_true", "is_false"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  text: ["eq", "neq", "in"],
  choice: ["eq", "neq", "in"],
};

/** Semantic colours; they follow the theme (light/dark). A rule may add a custom hex on top. */
export const INDICATOR_TONES = ["success", "warning", "danger", "info", "neutral"] as const;
export const indicatorToneSchema = z.enum(INDICATOR_TONES);
export type IndicatorTone = z.infer<typeof indicatorToneSchema>;

export const VALUE_SOURCES = ["manual", "home_assistant"] as const;
export const valueSourceSchema = z.enum(VALUE_SOURCES);
export type ValueSource = z.infer<typeof valueSourceSchema>;

/** Icon keys for profiles and rules; the UI maps them to icons. Stored as plain strings. */
export const DEVICE_ICONS = [
  "window",
  "door",
  "blinds",
  "thermometer",
  "droplets",
  "snowflake",
  "heater",
  "fan",
  "washing-machine",
  "refrigerator",
  "plug",
  "zap",
  "power",
  "shield",
  "siren",
  "smoke",
  "flame",
  "bell",
  "lock",
  "battery",
  "lightbulb",
  "sun",
  "motion",
  "activity",
  "camera",
  "cctv",
  "waves",
  "wind",
  "gauge",
  "tv",
  "router",
  "speaker",
] as const;
export const deviceIconSchema = z.enum(DEVICE_ICONS);
export type DeviceIconKey = z.infer<typeof deviceIconSchema>;

/** A field value: what a sensor reports or a person sets. `null` means unknown. */
export const fieldValueSchema = z.union([z.boolean(), z.number().finite(), z.string().max(200)]).nullable();
export type FieldValue = z.infer<typeof fieldValueSchema>;

/** camelCase or snake_case identifier, stable across renames of the label. */
export const fieldKeySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_]{0,39}$/, "Use letters, digits and _; start with a lowercase letter");

const labelSchema = z.string().trim().min(1).max(60);
const optionalLabelSchema = z.string().trim().max(60).nullable().optional();

export const fieldChoiceSchema = z.object({
  value: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "Use lowercase letters, digits and _"),
  label: labelSchema,
});
export type FieldChoice = z.infer<typeof fieldChoiceSchema>;

export const deviceFieldSchema = z
  .object({
    key: fieldKeySchema,
    label: labelSchema,
    type: fieldTypeSchema,
    /** Shown after numbers: "°C", "%", "W", "min". */
    unit: z.string().trim().max(12).nullable().optional(),
    /** Options of a `choice` field, in display order. */
    choices: z.array(fieldChoiceSchema).max(30).optional(),
    /** How a boolean reads: "Open" / "Closed" instead of yes/no. */
    trueLabel: optionalLabelSchema,
    falseLabel: optionalLabelSchema,
  })
  .refine((field) => field.type !== "choice" || (field.choices?.length ?? 0) > 0, {
    message: "A choice field needs at least one option",
    path: ["choices"],
  })
  .refine((field) => new Set((field.choices ?? []).map((choice) => choice.value)).size === (field.choices ?? []).length, {
    message: "Options must be unique",
    path: ["choices"],
  });
export type DeviceField = z.infer<typeof deviceFieldSchema>;

export const indicatorRuleSchema = z.object({
  /** Stable id within the profile (for React keys and "which rule matched"). */
  id: z.string().min(1).max(40),
  field: fieldKeySchema,
  operator: ruleOperatorSchema,
  /** Comparison value for eq/neq/gt/gte/lt/lte; the lower bound of `between`. */
  value: z.union([z.boolean(), z.number().finite(), z.string().max(200)]).nullable().optional(),
  /** Upper bound of `between` (inclusive). */
  valueTo: z.number().finite().nullable().optional(),
  /** Accepted values of `in`. */
  values: z.array(z.string().max(200)).max(30).optional(),
  tone: indicatorToneSchema,
  /** Optional custom colour that overrides the tone's colour. */
  color: hexColorSchema.nullable().optional(),
  label: labelSchema,
  icon: deviceIconSchema.nullable().optional(),
  /** Draw attention: the indicator pulses (running dryer, triggered alarm). */
  pulse: z.boolean().default(false),
});
export type IndicatorRule = z.infer<typeof indicatorRuleSchema>;

/** Values of HA sources older than this are stale, unless the profile says otherwise. */
export const DEFAULT_STALE_AFTER_MINUTES = 60;

export const deviceProfileInputSchema = z
  .object({
    name: labelSchema,
    icon: deviceIconSchema,
    category: deviceCategorySchema,
    fields: z.array(deviceFieldSchema).min(1).max(20),
    /** The field shown next to the indicator on the plan ("21,5 °C"). */
    primaryField: fieldKeySchema.nullable(),
    /** Evaluated top to bottom; the first match wins. */
    rules: z.array(indicatorRuleSchema).max(30),
    /** Tone when no rule matches or the value is unknown or stale. */
    fallbackTone: indicatorToneSchema,
    fallbackLabel: optionalLabelSchema,
    /** Home Assistant values older than this many minutes count as stale; null = never. */
    staleAfterMinutes: z.number().int().min(1).max(10_080).nullable(),
    /** The preset this profile was created from, if any (informative only). */
    presetKey: z.string().max(40).nullable().optional(),
  })
  .superRefine((profile, ctx) => {
    const keys = new Set<string>();
    profile.fields.forEach((field, index) => {
      if (keys.has(field.key)) ctx.addIssue({ code: "custom", message: "Field keys must be unique", path: ["fields", index, "key"] });
      keys.add(field.key);
    });
    if (profile.primaryField && !keys.has(profile.primaryField)) {
      ctx.addIssue({ code: "custom", message: "Unknown field", path: ["primaryField"] });
    }
    const ruleIds = new Set<string>();
    profile.rules.forEach((rule, index) => {
      if (ruleIds.has(rule.id)) ctx.addIssue({ code: "custom", message: "Rule ids must be unique", path: ["rules", index, "id"] });
      ruleIds.add(rule.id);
      const field = profile.fields.find((candidate) => candidate.key === rule.field);
      if (!field) {
        ctx.addIssue({ code: "custom", message: "Unknown field", path: ["rules", index, "field"] });
        return;
      }
      if (!OPERATORS_BY_TYPE[field.type].includes(rule.operator)) {
        ctx.addIssue({ code: "custom", message: "Operator does not fit the field type", path: ["rules", index, "operator"] });
      }
      if (rule.operator === "between" && (typeof rule.value !== "number" || typeof rule.valueTo !== "number")) {
        ctx.addIssue({ code: "custom", message: "Between needs two numbers", path: ["rules", index, "value"] });
      }
      if (["gt", "gte", "lt", "lte"].includes(rule.operator) && typeof rule.value !== "number") {
        ctx.addIssue({ code: "custom", message: "A number is required", path: ["rules", index, "value"] });
      }
      if ((rule.operator === "eq" || rule.operator === "neq") && (rule.value === undefined || rule.value === null || rule.value === "")) {
        ctx.addIssue({ code: "custom", message: "A value is required", path: ["rules", index, "value"] });
      }
      if (rule.operator === "in" && (rule.values?.length ?? 0) === 0) {
        ctx.addIssue({ code: "custom", message: "Pick at least one value", path: ["rules", index, "values"] });
      }
    });
  });
export type DeviceProfileInput = z.input<typeof deviceProfileInputSchema>;
export type DeviceProfileData = z.output<typeof deviceProfileInputSchema>;

/** Device form (create/edit). Position, bindings and values have their own endpoints. */
export const deviceInputSchema = z.object({
  name: labelSchema,
  profileId: idSchema,
  placeId: idSchema.optional().nullable(),
  applianceId: idSchema.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type DeviceInput = z.infer<typeof deviceInputSchema>;

const coordinateSchema = z.number().int().min(-100_000).max(100_000);

/** Put a device on a floor plan (cm, like the plan), or take it off with all nulls. */
export const devicePositionInputSchema = z.union([
  z.object({ floorId: idSchema, x: coordinateSchema, y: coordinateSchema }),
  z.object({ floorId: z.null(), x: z.null(), y: z.null() }),
]);
export type DevicePositionInput = z.infer<typeof devicePositionInputSchema>;

export const fieldBindingInputSchema = z.object({
  fieldKey: fieldKeySchema,
  source: valueSourceSchema,
  /** `sensor.kitchen_window_contact`; used from phase 8. */
  haEntityId: z
    .string()
    .trim()
    .regex(/^[a-z_]+\.[a-z0-9_]+$/, "Expected domain.object_id, e.g. binary_sensor.kitchen_window")
    .max(255)
    .nullable()
    .optional(),
  /** Read an attribute instead of the state (e.g. `current_temperature`). */
  haAttribute: z.string().trim().max(100).nullable().optional(),
});
export type FieldBindingInput = z.infer<typeof fieldBindingInputSchema>;

export const deviceBindingsInputSchema = z.object({ bindings: z.array(fieldBindingInputSchema).max(20) });
export type DeviceBindingsInput = z.infer<typeof deviceBindingsInputSchema>;

/** Body of `PUT /api/devices/:id/values/:fieldKey`. */
export const deviceValueInputSchema = z.object({ value: fieldValueSchema });
export type DeviceValueInput = z.infer<typeof deviceValueInputSchema>;

// Read models ------------------------------------------------------------------------------------------

export type DeviceProfile = DeviceProfileData & {
  id: string;
  presetKey: string | null;
  fallbackLabel: string | null;
  /** How many devices use this profile (a profile in use cannot be deleted). */
  deviceCount: number;
};

export type DevicePlace = {
  id: string;
  name: string;
  kind: "room" | "zone";
  color: string;
  icon: string | null;
  floorId: string;
  floorName: string;
};

/** One field of one device: where its value comes from and the current value. */
export type DeviceFieldBinding = {
  fieldKey: string;
  source: ValueSource;
  haEntityId: string | null;
  haAttribute: string | null;
  value: FieldValue;
  /** When the value last changed (ISO), or null when never set. */
  updatedAt: string | null;
};

export type Device = {
  id: string;
  name: string;
  notes: string | null;
  profileId: string;
  place: DevicePlace | null;
  /** On the plan of this floor at `position` (cm), or null when not placed. */
  floorId: string | null;
  position: { x: number; y: number } | null;
  appliance: { id: string; name: string } | null;
  /** One per field of the profile, in the profile's order. */
  values: DeviceFieldBinding[];
};

export type DevicesOverview = {
  devices: Device[];
  profiles: DeviceProfile[];
};

/** What the dashboard's house status card needs: every device with its profile. */
export type HouseStatus = DevicesOverview;

export type DeviceDetail = {
  device: Device;
  profile: DeviceProfile;
};

export type DevicePresetSummary = {
  key: string;
  name: string;
  icon: DeviceIconKey;
  category: DeviceCategory;
  description: string;
};

// Live events (published on the household's event stream, see src/api/lib/events.ts) ------------------

export const DEVICE_VALUE_EVENT = "device.value";
export const DEVICE_CHANGED_EVENT = "device.changed";

/** `device.value`: one field of one device got a new value. */
export type DeviceValueEvent = {
  deviceId: string;
  fieldKey: string;
  value: FieldValue;
  updatedAt: string;
  source: ValueSource;
};

/** `device.changed`: a device or profile was created, edited, moved or deleted; reload the data. */
export type DeviceChangedEvent = {
  deviceId: string | null;
  profileId: string | null;
  action: "created" | "updated" | "deleted";
};

// Helpers shared by the API and the UI ------------------------------------------------------------------

/** Adults and owners manage devices and set manual values; children only look. Mirrors the API. */
export const canManageDevices = canManageHousehold;

/**
 * Validates and normalises a value for a field: booleans, numbers and choices must fit the field.
 * Accepts the usual string forms ("on"/"off", "21.5") so Home Assistant states map cleanly.
 * Returns `undefined` when the value does not fit.
 */
export function coerceFieldValue(field: Pick<DeviceField, "type" | "choices">, raw: unknown): FieldValue | undefined {
  if (raw === null || raw === undefined || raw === "" || raw === "unknown" || raw === "unavailable") return null;
  switch (field.type) {
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (raw === 1 || raw === 0) return raw === 1;
      if (typeof raw === "string") {
        const text = raw.trim().toLowerCase();
        if (["true", "on", "yes", "1", "open", "detected"].includes(text)) return true;
        if (["false", "off", "no", "0", "closed", "clear"].includes(text)) return false;
      }
      return undefined;
    }
    case "number": {
      const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : NaN;
      return Number.isFinite(number) ? number : undefined;
    }
    case "choice": {
      const text = String(raw);
      return (field.choices ?? []).some((choice) => choice.value === text) ? text : undefined;
    }
    case "text":
      return typeof raw === "string" ? raw.slice(0, 200) : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : undefined;
  }
}

/** A Home Assistant value that has not been updated for too long is stale; manual values never are. */
export function isValueStale(
  binding: Pick<DeviceFieldBinding, "source" | "updatedAt">,
  staleAfterMinutes: number | null,
  now: number = Date.now(),
): boolean {
  if (binding.source !== "home_assistant" || staleAfterMinutes === null) return false;
  if (!binding.updatedAt) return true;
  return now - new Date(binding.updatedAt).getTime() > staleAfterMinutes * 60_000;
}

/** Bindings for every field of a profile, filling the ones a device has no row for yet. */
export function bindingsForProfile(
  profile: Pick<DeviceProfileData, "fields">,
  existing: readonly DeviceFieldBinding[],
): DeviceFieldBinding[] {
  return profile.fields.map(
    (field) =>
      existing.find((binding) => binding.fieldKey === field.key) ?? {
        fieldKey: field.key,
        source: "manual",
        haEntityId: null,
        haAttribute: null,
        value: null,
        updatedAt: null,
      },
  );
}

const NUMBER_LOCALES = { en: "en-BE", nl: "nl-BE" } as const;

/**
 * A value as a short text for the plan and lists: "21,5 °C", "Open", "Armed (home)". Booleans use the
 * field's labels when it has them. Returns null for unknown values.
 */
export function formatFieldValue(
  field: Pick<DeviceField, "type" | "unit" | "choices" | "trueLabel" | "falseLabel">,
  value: FieldValue,
  locale: "en" | "nl",
  booleanFallback: { true: string; false: string } = { true: locale === "nl" ? "Ja" : "Yes", false: locale === "nl" ? "Nee" : "No" },
): string | null {
  if (value === null) return null;
  switch (field.type) {
    case "boolean":
      return value === true ? (field.trueLabel || booleanFallback.true) : (field.falseLabel || booleanFallback.false);
    case "number": {
      if (typeof value !== "number") return String(value);
      const text = new Intl.NumberFormat(NUMBER_LOCALES[locale], { maximumFractionDigits: 1 }).format(value);
      if (!field.unit) return text;
      return field.unit === "%" ? `${text}%` : `${text} ${field.unit}`;
    }
    case "choice":
      return field.choices?.find((choice) => choice.value === value)?.label ?? String(value);
    case "text":
      return String(value);
  }
}
