import { HousePlugIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { bindingsForProfile, isValueStale, type Device, type DeviceProfile } from "../types/devices";
import { useFieldFormatter } from "./device-indicator";
import { DeviceValueControl } from "./device-value-control";
import { formatRelativeTime } from "@/lib/format";

type DeviceValuesListProps = {
  device: Device;
  profile: DeviceProfile;
  /** Adults and owners set manual values; children only see them. */
  canSetValues: boolean;
  now: number;
  className?: string;
};

/** Every field of a device: current value, when it changed, where it comes from, and a manual control. */
export function DeviceValuesList({ device, profile, canSetValues, now, className }: DeviceValuesListProps) {
  const { t } = useTranslation("devices");
  const format = useFieldFormatter();
  const locale = currentLocale();
  const bindings = bindingsForProfile(profile, device.values);

  return (
    <ul className={cn("divide-y", className)}>
      {profile.fields.map((field, index) => {
        const binding = bindings[index]!;
        const stale = isValueStale(binding, profile.staleAfterMinutes, now);
        const text = format(field, binding.value);
        const fromHa = binding.source === "home_assistant";
        return (
          <li key={field.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-sm font-medium">
                {field.label}
                {profile.primaryField === field.key && <Badge variant="secondary">{t("values.primary")}</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                {binding.updatedAt ? t("values.updated", { when: formatRelativeTime(binding.updatedAt, locale, now) }) : t("values.never")}
                {fromHa && (
                  <>
                    {" · "}
                    <HousePlugIcon className="inline size-3" aria-hidden="true" /> {binding.haEntityId ?? t("bindings.noEntity")}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {stale && <Badge variant="outline" className="border-dashed text-muted-foreground">{t("state.stale")}</Badge>}
              {canSetValues && !fromHa ? (
                <DeviceValueControl deviceId={device.id} field={field} value={binding.value} label={`${device.name}: ${field.label}`} />
              ) : (
                <span className={cn("text-sm font-semibold tabular-nums", (stale || text === null) && "text-muted-foreground")}>
                  {text ?? t("state.unknown")}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
