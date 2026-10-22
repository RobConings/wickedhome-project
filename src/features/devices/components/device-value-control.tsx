import * as React from "react";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DevicesActionResult } from "../data/devices-loaders";
import type { DeviceField, FieldValue } from "../types/devices";

type DeviceValueControlProps = {
  deviceId: string;
  field: DeviceField;
  value: FieldValue;
  /** Accessible name, e.g. "Kitchen window: Open". */
  label: string;
  className?: string;
};

/**
 * Sets a manual value: a toggle for booleans, a list for choices, an input for numbers and text. Posts
 * `intent=set-value` to the route action, which publishes the change live. Toggles and choices update
 * optimistically (rolled back with a toast if saving fails); typed values show a busy button.
 */
export function DeviceValueControl({ deviceId, field, value, label, className }: DeviceValueControlProps) {
  const { t } = useTranslation("devices");
  const fetcher = useFetcher<DevicesActionResult>({ key: `device-value-${deviceId}-${field.key}` });
  const busy = fetcher.state !== "idle";
  // Optimistic: show what was just sent until the reload confirms it.
  const pending = fetcher.formData?.get("value");
  const shown: FieldValue = typeof pending === "string" ? (JSON.parse(pending) as FieldValue) : value;

  const handled = React.useRef<DevicesActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (!fetcher.data.ok) toast.error(fetcher.data.formError ?? t("values.saveFailed"));
  }, [fetcher.state, fetcher.data, t]);

  const submit = (next: FieldValue) =>
    fetcher.submit({ intent: "set-value", deviceId, fieldKey: field.key, value: JSON.stringify(next) }, { method: "post" });

  if (field.type === "boolean") {
    const options = [
      { value: false, text: field.falseLabel || t("value.no") },
      { value: true, text: field.trueLabel || t("value.yes") },
    ];
    return (
      <div role="group" aria-label={label} className={cn("inline-flex rounded-lg border bg-muted p-0.5", className)}>
        {options.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            size="sm"
            variant={shown === option.value ? "default" : "ghost"}
            aria-pressed={shown === option.value}
            className="h-7 px-3"
            onClick={() => submit(option.value)}
          >
            {option.text}
          </Button>
        ))}
      </div>
    );
  }

  if (field.type === "choice") {
    return (
      <Select value={typeof shown === "string" ? shown : ""} onValueChange={(next) => submit(next)}>
        <SelectTrigger size="sm" aria-label={label} className={cn("min-w-40", className)}>
          <SelectValue placeholder={t("state.unknown")} />
        </SelectTrigger>
        <SelectContent>
          {(field.choices ?? []).map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <form
      className={cn("flex items-center gap-1", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const raw = String(new FormData(event.currentTarget).get("value") ?? "").trim();
        if (raw === "") return submit(null);
        if (field.type === "number") {
          const number = Number(raw.replace(",", "."));
          if (!Number.isFinite(number)) {
            toast.error(t("values.invalid"));
            return;
          }
          return submit(number);
        }
        return submit(raw);
      }}
    >
      <Input
        key={String(value)}
        disabled={busy}
        name="value"
        aria-label={label}
        defaultValue={value === null ? "" : String(value)}
        inputMode={field.type === "number" ? "decimal" : undefined}
        className="h-8 w-28"
        maxLength={200}
      />
      {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
      <Button type="submit" size="icon" variant="outline" className="size-8" loading={busy} aria-label={busy ? t("values.saving") : t("values.set")} title={t("values.set")}>
        <CheckIcon />
      </Button>
    </form>
  );
}
