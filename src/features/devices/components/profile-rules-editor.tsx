import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import { OPERATORS_BY_TYPE, type DeviceField, type IndicatorRule, type RuleOperator } from "../types/devices";
import { DeviceIconSelect } from "./device-icon-select";
import { DraftNumberInput } from "./draft-number-input";
import { addRule, moveItem, updateRule, type ProfileDraft } from "./profile-draft";
import { ToneSelect } from "./tone-select";

type ProfileRulesEditorProps = {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  /** The rule that matches the preview's sample values, highlighted. */
  matchedRuleId?: string | null;
  disabled?: boolean;
};

/** Indicator rules, top to bottom: the first one that matches decides the colour on the plan. */
export function ProfileRulesEditor({ draft, onChange, matchedRuleId, disabled }: ProfileRulesEditorProps) {
  const { t } = useTranslation("devices");
  const set = (index: number, change: Partial<IndicatorRule>) => onChange(updateRule(draft, index, change));

  return (
    <div className="flex flex-col gap-3">
      {draft.rules.length === 0 && <p className="text-sm text-muted-foreground">{t("editor.rules.empty")}</p>}
      <ol className="flex flex-col gap-3">
        {draft.rules.map((rule, index) => {
          const field = draft.fields.find((candidate) => candidate.key === rule.field);
          const id = `rule-${rule.id}`;
          const matched = matchedRuleId === rule.id;
          return (
            <li key={rule.id} className={cn("flex flex-col gap-3 rounded-lg border bg-background/50 p-3", matched && "border-primary ring-1 ring-primary")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="grid size-6 place-items-center rounded-full bg-muted text-xs tabular-nums">{index + 1}</span>
                  <PlanMarkerDot tone={rule.tone} color={rule.color} pulse={rule.pulse} />
                  {rule.label || t("editor.rules.untitled")}
                  {matched && (
                    <Badge variant="secondary">
                      <CheckIcon />
                      {t("editor.rules.matches")}
                    </Badge>
                  )}
                </span>
                <span className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || index === 0} aria-label={t("editor.moveUp")} onClick={() => onChange({ ...draft, rules: moveItem(draft.rules, index, -1) })}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || index === draft.rules.length - 1} aria-label={t("editor.moveDown")} onClick={() => onChange({ ...draft, rules: moveItem(draft.rules, index, 1) })}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={t("editor.rules.remove")} onClick={() => onChange({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}>
                    <Trash2Icon />
                  </Button>
                </span>
              </div>

              {/* Condition: "If <field> <operator> <value>". */}
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-field`}>{t("editor.rules.when")}</Label>
                  <Select value={rule.field} onValueChange={(next) => set(index, { field: next })} disabled={disabled}>
                    <SelectTrigger id={`${id}-field`} className="w-full">
                      <SelectValue placeholder={t("editor.rules.pickField")} />
                    </SelectTrigger>
                    <SelectContent>
                      {draft.fields.map((candidate) => (
                        <SelectItem key={candidate.key} value={candidate.key}>
                          {candidate.label || candidate.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-operator`}>{t("editor.rules.operator")}</Label>
                  <Select value={rule.operator} onValueChange={(next) => set(index, { operator: next as RuleOperator })} disabled={disabled || !field}>
                    <SelectTrigger id={`${id}-operator`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(field ? OPERATORS_BY_TYPE[field.type] : []).map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {t(`operators.${operator}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field && <RuleValueEditor id={id} rule={rule} field={field} disabled={disabled} onChange={(change) => set(index, change)} />}
              </div>

              {/* Result: colour, label, icon, pulse. */}
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-tone`}>{t("editor.rules.tone")}</Label>
                  <ToneSelect id={`${id}-tone`} value={rule.tone} disabled={disabled} onChange={(tone) => set(index, { tone })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-label`}>{t("editor.rules.label")}</Label>
                  <Input id={`${id}-label`} value={rule.label} maxLength={60} disabled={disabled} onChange={(event) => set(index, { label: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-icon`}>{t("editor.rules.icon")}</Label>
                  <DeviceIconSelect id={`${id}-icon`} value={rule.icon ?? null} allowNone disabled={disabled} onChange={(icon) => set(index, { icon })} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={rule.pulse} disabled={disabled} onChange={(event) => set(index, { pulse: event.target.checked })} />
                  {t("editor.rules.pulse")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={Boolean(rule.color)}
                    disabled={disabled}
                    onChange={(event) => set(index, { color: event.target.checked ? "#c2508a" : null })}
                  />
                  {t("editor.rules.customColor")}
                </label>
                {rule.color && (
                  <input
                    type="color"
                    aria-label={t("editor.rules.customColor")}
                    value={rule.color}
                    disabled={disabled}
                    className="h-8 w-12 cursor-pointer rounded border bg-transparent"
                    onChange={(event) => set(index, { color: event.target.value })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" className="self-start" disabled={disabled || draft.rules.length >= 30 || draft.fields.length === 0} onClick={() => onChange(addRule(draft, t("editor.rules.newRule")))}>
        <PlusIcon />
        {t("editor.rules.add")}
      </Button>
    </div>
  );
}

type RuleValueEditorProps = {
  id: string;
  rule: IndicatorRule;
  field: DeviceField;
  disabled?: boolean;
  onChange: (change: Partial<IndicatorRule>) => void;
};

/** The comparison value(s), shaped by the operator and the field type. */
function RuleValueEditor({ id, rule, field, disabled, onChange }: RuleValueEditorProps) {
  const { t } = useTranslation("devices");
  const label = (
    <Label htmlFor={`${id}-value`}>
      {t("editor.rules.value")}
      {field.unit ? ` (${field.unit})` : ""}
    </Label>
  );

  if (rule.operator === "is_true" || rule.operator === "is_false") return <span />;

  if (rule.operator === "between") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <div className="flex items-center gap-2">
          <DraftNumberInput id={`${id}-value`} value={typeof rule.value === "number" ? rule.value : null} disabled={disabled} onChange={(value) => onChange({ value })} />
          <span className="text-sm text-muted-foreground">{t("editor.rules.and")}</span>
          <DraftNumberInput aria-label={t("editor.rules.upperBound")} value={rule.valueTo ?? null} disabled={disabled} onChange={(valueTo) => onChange({ valueTo })} />
        </div>
      </div>
    );
  }

  if (rule.operator === "in") {
    if (field.type === "choice") {
      const selected = new Set(rule.values ?? []);
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t("editor.rules.values")}</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(field.choices ?? []).map((choice) => (
              <label key={choice.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(choice.value)}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(choice.value);
                    else next.delete(choice.value);
                    onChange({ values: [...next] });
                  }}
                />
                {choice.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-value`}>{t("editor.rules.valuesComma")}</Label>
        <Input
          id={`${id}-value`}
          value={(rule.values ?? []).join(", ")}
          disabled={disabled}
          onChange={(event) => onChange({ values: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) })}
        />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <DraftNumberInput id={`${id}-value`} value={typeof rule.value === "number" ? rule.value : null} disabled={disabled} onChange={(value) => onChange({ value })} />
      </div>
    );
  }

  if (field.type === "choice") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Select value={typeof rule.value === "string" ? rule.value : ""} onValueChange={(value) => onChange({ value })} disabled={disabled}>
          <SelectTrigger id={`${id}-value`} className="w-full">
            <SelectValue placeholder={t("editor.rules.pickValue")} />
          </SelectTrigger>
          <SelectContent>
            {(field.choices ?? []).map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <Input id={`${id}-value`} value={typeof rule.value === "string" ? rule.value : ""} maxLength={200} disabled={disabled} onChange={(event) => onChange({ value: event.target.value })} />
    </div>
  );
}
