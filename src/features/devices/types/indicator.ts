import {
  coerceFieldValue,
  isValueStale,
  type DeviceField,
  type DeviceIconKey,
  type DeviceProfileData,
  type FieldValue,
  type IndicatorRule,
  type IndicatorTone,
  type ValueSource,
} from "./devices";

// The rule engine. Pure and isomorphic: the API uses it for summaries, the UI for the plan, lists and the
// live preview in the profile editor. Tested in src/api/devices/indicator.test.ts.

/** A field's current value as the engine sees it. `source`/`updatedAt` matter for staleness only. */
export type IndicatorValue = {
  value: FieldValue;
  updatedAt?: string | null;
  source?: ValueSource;
};

/** Field key → value. A bare value is accepted too (preview, tests). */
export type IndicatorValues = Readonly<Record<string, IndicatorValue | FieldValue | undefined>>;

export type IndicatorProfile = Pick<DeviceProfileData, "fields" | "rules" | "primaryField" | "fallbackTone" | "staleAfterMinutes"> & {
  fallbackLabel?: string | null;
};

export type IndicatorResult = {
  tone: IndicatorTone;
  /** Custom colour of the matching rule, if any. */
  color: string | null;
  /** The matching rule's label, or the profile's fallback label. Null: the UI says "Unknown". */
  label: string | null;
  icon: DeviceIconKey | null;
  pulse: boolean;
  /** Id of the rule that matched, or null for the fallback. */
  ruleId: string | null;
  /** A value the rules or the primary field depend on is unknown. */
  unknown: boolean;
  /** A value the rules or the primary field depend on is stale (Home Assistant stopped reporting). */
  stale: boolean;
  /** The primary field and its (fresh, coerced) value, for "21,5 °C" next to the indicator. */
  primary: { field: DeviceField; value: FieldValue } | null;
};

export type EvaluateOptions = {
  /** Clock for staleness, in ms (defaults to now). */
  now?: number;
};

const isIndicatorValue = (entry: IndicatorValue | FieldValue | undefined): entry is IndicatorValue =>
  typeof entry === "object" && entry !== null && "value" in entry;

/** Resolves a field's value: coerced to the field type, null when unknown, missing or stale. */
function resolve(
  field: DeviceField,
  entry: IndicatorValue | FieldValue | undefined,
  staleAfterMinutes: number | null,
  now: number,
): { value: FieldValue; stale: boolean } {
  if (entry === undefined) return { value: null, stale: false };
  const state: IndicatorValue = isIndicatorValue(entry) ? entry : { value: entry };
  const stale = isValueStale({ source: state.source ?? "manual", updatedAt: state.updatedAt ?? null }, staleAfterMinutes, now);
  if (stale) return { value: null, stale: true };
  return { value: coerceFieldValue(field, state.value) ?? null, stale: false };
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }
  return null;
};

/** Equality that tolerates "21" vs 21 and "true" vs true, as values from forms and HA arrive as strings. */
function looselyEqual(field: DeviceField, actual: FieldValue, expected: unknown): boolean {
  if (expected === undefined || expected === null) return false;
  const coerced = coerceFieldValue(field, expected);
  if (coerced === undefined || coerced === null) return false;
  return actual === coerced;
}

/** Does one rule match a (resolved, non-null) value? Exported for the editor's per-rule hints. */
export function ruleMatches(rule: IndicatorRule, field: DeviceField, value: FieldValue): boolean {
  if (value === null) return false;
  switch (rule.operator) {
    case "is_true":
      return value === true;
    case "is_false":
      return value === false;
    case "eq":
      return looselyEqual(field, value, rule.value);
    case "neq":
      return !looselyEqual(field, value, rule.value);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const actual = toNumber(value);
      const limit = toNumber(rule.value);
      if (actual === null || limit === null) return false;
      if (rule.operator === "gt") return actual > limit;
      if (rule.operator === "gte") return actual >= limit;
      if (rule.operator === "lt") return actual < limit;
      return actual <= limit;
    }
    case "between": {
      const actual = toNumber(value);
      const low = toNumber(rule.value);
      const high = toNumber(rule.valueTo);
      if (actual === null || low === null || high === null) return false;
      return actual >= Math.min(low, high) && actual <= Math.max(low, high);
    }
    case "in":
      return (rule.values ?? []).includes(String(value));
  }
}

/**
 * Evaluates a profile's indicator rules against a device's values. Rules run top to bottom and the first
 * match wins. A rule on an unknown or stale value never matches. Without a match the profile's fallback
 * tone (and label) is used.
 */
export function evaluateIndicator(profile: IndicatorProfile, values: IndicatorValues, options: EvaluateOptions = {}): IndicatorResult {
  const now = options.now ?? Date.now();
  const fields = new Map(profile.fields.map((field) => [field.key, field]));
  const resolved = new Map<string, { value: FieldValue; stale: boolean }>();
  const get = (key: string) => {
    const field = fields.get(key);
    if (!field) return null;
    let entry = resolved.get(key);
    if (!entry) {
      entry = resolve(field, values[key], profile.staleAfterMinutes, now);
      resolved.set(key, entry);
    }
    return { field, ...entry };
  };

  // Which fields matter: those the rules look at, and the primary one.
  const relevant = new Set(profile.rules.map((rule) => rule.field));
  if (profile.primaryField) relevant.add(profile.primaryField);
  let unknown = false;
  let stale = false;
  for (const key of relevant) {
    const entry = get(key);
    if (!entry) continue;
    if (entry.stale) stale = true;
    else if (entry.value === null) unknown = true;
  }

  const primaryEntry = profile.primaryField ? get(profile.primaryField) : null;
  const primary = primaryEntry ? { field: primaryEntry.field, value: primaryEntry.value } : null;

  for (const rule of profile.rules) {
    const entry = get(rule.field);
    if (!entry || entry.value === null) continue;
    if (ruleMatches(rule, entry.field, entry.value)) {
      return {
        tone: rule.tone,
        color: rule.color ?? null,
        label: rule.label,
        icon: rule.icon ?? null,
        pulse: rule.pulse ?? false,
        ruleId: rule.id,
        unknown,
        stale,
        primary,
      };
    }
  }

  return {
    tone: profile.fallbackTone,
    color: null,
    label: profile.fallbackLabel ?? null,
    icon: null,
    pulse: false,
    ruleId: null,
    unknown,
    stale,
    primary,
  };
}

/** One legend entry per rule (plus the fallback), in rule order, without duplicate tone+label pairs. */
export function indicatorLegend(profile: IndicatorProfile): { tone: IndicatorTone; color: string | null; label: string | null; pulse: boolean }[] {
  const entries = [
    ...profile.rules.map((rule) => ({ tone: rule.tone, color: rule.color ?? null, label: rule.label, pulse: rule.pulse ?? false })),
    { tone: profile.fallbackTone, color: null, label: profile.fallbackLabel ?? null, pulse: false },
  ];
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.tone}|${entry.color ?? ""}|${entry.label ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
