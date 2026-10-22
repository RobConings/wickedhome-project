import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import { INDICATOR_TONES, type IndicatorTone } from "../types/devices";

type ToneSelectProps = {
  id?: string;
  value: IndicatorTone;
  onChange: (tone: IndicatorTone) => void;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

/** Pick a semantic colour: green, orange, red, blue or grey (theme-aware). */
export function ToneSelect({ id, value, onChange, disabled, className, ...props }: ToneSelectProps) {
  const { t } = useTranslation("devices");
  return (
    <Select disabled={disabled} value={value} onValueChange={(next) => onChange(next as IndicatorTone)}>
      <SelectTrigger id={id} aria-label={props["aria-label"]} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INDICATOR_TONES.map((tone) => (
          <SelectItem key={tone} value={tone}>
            <PlanMarkerDot tone={tone} />
            {t(`tones.${tone}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
