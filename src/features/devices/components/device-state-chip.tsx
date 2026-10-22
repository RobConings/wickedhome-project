import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import type { DeviceState } from "./device-indicator";

type DeviceStateChipProps = {
  state: DeviceState;
  /** Also show the primary value ("21,5 °C"). */
  showValue?: boolean;
  className?: string;
};

/** A device's current state as a small chip: the plan's dot, the rule's label and the primary value. */
export function DeviceStateChip({ state, showValue = true, className }: DeviceStateChipProps) {
  const { indicator, label, primaryText } = state;
  const value = showValue && indicator.primary?.field.type !== "boolean" ? primaryText : null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        (indicator.stale || (indicator.unknown && indicator.ruleId === null)) && "border-dashed text-muted-foreground",
        className,
      )}
    >
      <PlanMarkerDot tone={indicator.tone} color={indicator.color} pulse={indicator.pulse} />
      <span className="truncate">{label}</span>
      {value && <span className="text-muted-foreground tabular-nums">{value}</span>}
    </span>
  );
}
