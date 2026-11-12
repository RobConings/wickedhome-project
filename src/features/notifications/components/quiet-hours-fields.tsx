import { FormField } from "@/components/shared/form-field";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { PageGrid } from "@/components/layout/page-grid";
import * as React from "react";
import { MoonIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { timeOfDaySchema, type QuietHours } from "../types/notifications";

type QuietHoursFieldsProps = {
  value: QuietHours;
  onChange: (value: QuietHours) => void;
  disabled?: boolean;
};

/** Quiet hours: a switch and from/to times (saved when a time is complete and changed). */
export function QuietHoursFields({ value, onChange, disabled = false }: QuietHoursFieldsProps) {
  const { t } = useTranslation("notifications");
  const [draft, setDraft] = React.useState({ start: value.start, end: value.end });
  const [shown, setShown] = React.useState(value);
  const id = React.useId();

  // The stored value changed elsewhere (saved, reloaded): show it (state adjusted while rendering, no effect).
  if (shown.start !== value.start || shown.end !== value.end) {
    setShown(value);
    setDraft({ start: value.start, end: value.end });
  }

  const commit = (field: "start" | "end") => {
    const next = draft[field];
    if (timeOfDaySchema.safeParse(next).success && next !== value[field]) onChange({ ...value, [field]: next });
    else setDraft({ start: value.start, end: value.end });
  };

  return (
    <Stack gap="3" className="rounded-lg border p-3">
      <Inline gap="md" align="start">
        <MoonIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-on`} className="font-medium">
            {t("quiet.enabled")}
          </Label>
          <Text size="sm" tone="muted">{t("quiet.description")}</Text>
        </div>
        <Switch id={`${id}-on`} checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} disabled={disabled} />
      </Inline>
      {value.enabled && (
        <PageGrid gap="3" className="grid-cols-2 sm:max-w-sm">
          {(["start", "end"] as const).map((field) => (
            <FormField htmlFor={`${id}-${field}`} label={<>{t(field === "start" ? "quiet.from" : "quiet.to")}</>} key={field}>
              <Input
                id={`${id}-${field}`}
                type="time"
                step={300}
                className="text-base sm:text-sm"
                value={draft[field]}
                disabled={disabled}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                onBlur={() => commit(field)}
              />
            </FormField>
          ))}
        </PageGrid>
      )}
    </Stack>
  );
}
