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
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <MoonIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-on`} className="font-medium">
            {t("quiet.enabled")}
          </Label>
          <p className="text-sm text-muted-foreground">{t("quiet.description")}</p>
        </div>
        <Switch id={`${id}-on`} checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} disabled={disabled} />
      </div>
      {value.enabled && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          {(["start", "end"] as const).map((field) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-${field}`}>{t(field === "start" ? "quiet.from" : "quiet.to")}</Label>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
