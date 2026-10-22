import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEVICE_ICONS, type DeviceIconKey } from "../types/devices";
import { DeviceIcon } from "./device-icon";

type DeviceIconSelectProps = {
  id?: string;
  value: DeviceIconKey | null;
  onChange: (icon: DeviceIconKey | null) => void;
  /** Offer "no icon" (rules may have none; profiles always have one). */
  allowNone?: boolean;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

const NONE = "__none";

/** Pick one of the device icons. */
export function DeviceIconSelect({ id, value, onChange, allowNone = false, disabled, className, ...props }: DeviceIconSelectProps) {
  const { t } = useTranslation("devices");
  return (
    <Select disabled={disabled} value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : (next as DeviceIconKey))}>
      <SelectTrigger id={id} aria-label={props["aria-label"]} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{t("icons.none")}</SelectItem>}
        {DEVICE_ICONS.map((icon) => (
          <SelectItem key={icon} value={icon}>
            <DeviceIcon icon={icon} />
            {t(`icons.${icon}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
