import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import type { AlarmState } from "../types/home-assistant";
import { alarmTone } from "./alarm-tone";

/** The alarm state as a chip with the plan's coloured dot (pulsing while triggered or arming). */
export function AlarmStateChip({ state, className }: { state: AlarmState; className?: string }) {
  const { t } = useTranslation("home-assistant");
  const unknown = state === "unknown" || state === "unavailable";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-sm font-medium whitespace-nowrap",
        unknown && "border-dashed text-muted-foreground",
        className,
      )}
    >
      <PlanMarkerDot tone={alarmTone(state)} pulse={state === "triggered" || state === "pending" || state === "arming"} />
      {t(`alarm.states.${state}`)}
    </span>
  );
}
