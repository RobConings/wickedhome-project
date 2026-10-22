import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import type { FieldValue } from "../types/devices";
import type { IndicatorResult } from "../types/indicator";
import { deviceIconComponent } from "./device-icons";
import { useFieldFormatter } from "./device-indicator";
import { DeviceLegend } from "./device-legend";
import { DraftNumberInput } from "./draft-number-input";
import type { ProfileDraft } from "./profile-draft";

type ProfilePreviewProps = {
  draft: ProfileDraft;
  /** Sample values per field key; null = unknown. */
  values: Record<string, FieldValue>;
  onValuesChange: (values: Record<string, FieldValue>) => void;
  /** evaluateIndicator(draft, values), computed by the editor so the rules list can highlight the match. */
  result: IndicatorResult;
  className?: string;
};

const UNKNOWN = "__unknown";

/** Try the rules: set sample values and see the indicator the plan would show. */
export function ProfilePreview({ draft, values, onValuesChange, result, className }: ProfilePreviewProps) {
  const { t } = useTranslation("devices");
  const format = useFieldFormatter();
  const set = (key: string, value: FieldValue) => onValuesChange({ ...values, [key]: value });
  const matchedIndex = draft.rules.findIndex((rule) => rule.id === result.ruleId);
  const label = result.label ?? (result.stale ? t("state.stale") : t("state.unknown"));
  const primary = result.primary && result.primary.field.type !== "boolean" ? format(result.primary.field, result.primary.value) : null;
  const legendProfile = { ...draft, id: "preview", deviceCount: 0, presetKey: draft.presetKey ?? null, fallbackLabel: draft.fallbackLabel ?? null };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4" aria-live="polite">
        <PlanMarkerDot tone={result.tone} color={result.color} pulse={result.pulse} icon={deviceIconComponent(result.icon ?? draft.icon)} size="md" className="scale-125" />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">{label}</span>
          <span className="text-xs text-muted-foreground">
            {matchedIndex >= 0 ? t("editor.preview.matched", { number: matchedIndex + 1 }) : t("editor.preview.fallback")}
            {primary && ` · ${primary}`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t("editor.preview.sampleValues")}</p>
        {draft.fields.map((field) => {
          const id = `preview-${field.key}`;
          const value = values[field.key] ?? null;
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={id} className="flex items-center gap-2">
                {field.label || field.key}
                {field.unit && <span className="text-muted-foreground">({field.unit})</span>}
                {draft.primaryField === field.key && <Badge variant="secondary">{t("values.primary")}</Badge>}
              </Label>
              {field.type === "boolean" ? (
                <div id={id} role="group" className="inline-flex self-start rounded-lg border bg-muted p-0.5">
                  {[
                    { value: null, text: t("state.unknown") },
                    { value: false, text: field.falseLabel || t("value.no") },
                    { value: true, text: field.trueLabel || t("value.yes") },
                  ].map((option) => (
                    <Button
                      key={String(option.value)}
                      type="button"
                      size="sm"
                      variant={value === option.value ? "default" : "ghost"}
                      aria-pressed={value === option.value}
                      className="h-7 px-3"
                      onClick={() => set(field.key, option.value)}
                    >
                      {option.text}
                    </Button>
                  ))}
                </div>
              ) : field.type === "choice" ? (
                <Select value={typeof value === "string" ? value : UNKNOWN} onValueChange={(next) => set(field.key, next === UNKNOWN ? null : next)}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNKNOWN}>{t("state.unknown")}</SelectItem>
                    {(field.choices ?? []).map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "number" ? (
                <DraftNumberInput id={id} value={typeof value === "number" ? value : null} placeholder={t("state.unknown")} onChange={(next) => set(field.key, next)} />
              ) : (
                <Input id={id} value={typeof value === "string" ? value : ""} placeholder={t("state.unknown")} onChange={(event) => set(field.key, event.target.value || null)} />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm font-medium">{t("legend.title")}</p>
        <DeviceLegend profiles={[legendProfile]} layout="list" />
      </div>
    </div>
  );
}
