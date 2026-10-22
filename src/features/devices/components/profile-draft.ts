import {
  OPERATORS_BY_TYPE,
  type DeviceField,
  type DeviceProfile,
  type DeviceProfileData,
  type FieldType,
  type IndicatorRule,
} from "../types/devices";

// Pure edits on the profile being edited. The editor keeps a `DeviceProfileData` draft and validates it
// with deviceProfileInputSchema on save.

export type ProfileDraft = DeviceProfileData;

export const toDraft = (profile: DeviceProfile): ProfileDraft => ({
  name: profile.name,
  icon: profile.icon,
  category: profile.category,
  fields: profile.fields,
  primaryField: profile.primaryField,
  rules: profile.rules,
  fallbackTone: profile.fallbackTone,
  fallbackLabel: profile.fallbackLabel,
  staleAfterMinutes: profile.staleAfterMinutes,
  presetKey: profile.presetKey,
});

export function blankDraft(fieldLabel: string): ProfileDraft {
  return {
    name: "",
    icon: "plug",
    category: "sensor",
    fields: [{ key: "state", label: fieldLabel, type: "boolean", unit: null, trueLabel: null, falseLabel: null }],
    primaryField: "state",
    rules: [],
    fallbackTone: "neutral",
    fallbackLabel: null,
    staleAfterMinutes: 60,
    presetKey: null,
  };
}

export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

let counter = 0;
/** A short id that is unique within the profile. */
export function newRuleId(rules: readonly IndicatorRule[]): string {
  const taken = new Set(rules.map((rule) => rule.id));
  let id: string;
  do {
    counter += 1;
    id = `rule-${Date.now().toString(36)}${counter}`;
  } while (taken.has(id));
  return id;
}

export function newFieldKey(fields: readonly DeviceField[]): string {
  const taken = new Set(fields.map((field) => field.key));
  let number = fields.length + 1;
  while (taken.has(`field${number}`)) number += 1;
  return `field${number}`;
}

export function addField(draft: ProfileDraft, label: string): ProfileDraft {
  const field: DeviceField = { key: newFieldKey(draft.fields), label, type: "number", unit: null };
  return { ...draft, fields: [...draft.fields, field], primaryField: draft.primaryField ?? field.key };
}

/** Updates a field; renaming its key also renames it in the rules and the primary field. */
export function updateField(draft: ProfileDraft, index: number, change: Partial<DeviceField>): ProfileDraft {
  const current = draft.fields[index];
  if (!current) return draft;
  const next: DeviceField = { ...current, ...change };
  if (change.type && change.type !== current.type) Object.assign(next, defaultsForType(next, change.type));
  const renamed = change.key !== undefined && change.key !== current.key;
  const allowed = OPERATORS_BY_TYPE[next.type];
  return {
    ...draft,
    fields: draft.fields.map((field, i) => (i === index ? next : field)),
    primaryField: renamed && draft.primaryField === current.key ? next.key : draft.primaryField,
    rules: draft.rules.map((rule) => {
      if (rule.field !== current.key) return rule;
      const field = renamed ? next.key : rule.field;
      // A type change may leave an operator that no longer fits: take the first one that does.
      return allowed.includes(rule.operator) ? { ...rule, field } : { ...rule, field, ...defaultRuleCondition(next) };
    }),
  };
}

function defaultsForType(field: DeviceField, type: FieldType): Partial<DeviceField> {
  return {
    unit: type === "number" ? field.unit ?? null : null,
    choices: type === "choice" ? (field.choices?.length ? field.choices : [{ value: "on", label: "On" }]) : undefined,
    trueLabel: type === "boolean" ? field.trueLabel ?? null : null,
    falseLabel: type === "boolean" ? field.falseLabel ?? null : null,
  };
}

/** Removes a field and the rules that look at it. */
export function removeField(draft: ProfileDraft, index: number): ProfileDraft {
  const field = draft.fields[index];
  if (!field) return draft;
  const fields = draft.fields.filter((_, i) => i !== index);
  return {
    ...draft,
    fields,
    primaryField: draft.primaryField === field.key ? (fields[0]?.key ?? null) : draft.primaryField,
    rules: draft.rules.filter((rule) => rule.field !== field.key),
  };
}

/** A sensible condition for a field: "is true", "> 0", "= first option". */
export function defaultRuleCondition(field: DeviceField): Pick<IndicatorRule, "operator" | "value" | "valueTo" | "values"> {
  switch (field.type) {
    case "boolean":
      return { operator: "is_true", value: null, valueTo: null, values: undefined };
    case "number":
      return { operator: "gt", value: 0, valueTo: null, values: undefined };
    case "choice":
      return { operator: "eq", value: field.choices?.[0]?.value ?? "", valueTo: null, values: undefined };
    case "text":
      return { operator: "eq", value: "", valueTo: null, values: undefined };
  }
}

export function addRule(draft: ProfileDraft, label: string): ProfileDraft {
  const field = draft.fields.find((candidate) => candidate.key === draft.primaryField) ?? draft.fields[0];
  if (!field) return draft;
  const rule: IndicatorRule = {
    id: newRuleId(draft.rules),
    field: field.key,
    ...defaultRuleCondition(field),
    tone: "success",
    color: null,
    label,
    icon: null,
    pulse: false,
  };
  return { ...draft, rules: [...draft.rules, rule] };
}

export function updateRule(draft: ProfileDraft, index: number, change: Partial<IndicatorRule>): ProfileDraft {
  return {
    ...draft,
    rules: draft.rules.map((rule, i) => {
      if (i !== index) return rule;
      const next = { ...rule, ...change };
      if (change.field && change.field !== rule.field) {
        const field = draft.fields.find((candidate) => candidate.key === change.field);
        if (field) Object.assign(next, defaultRuleCondition(field));
      }
      return next;
    }),
  };
}
