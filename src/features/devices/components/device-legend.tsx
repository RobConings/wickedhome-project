import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PlanLegend } from "@/features/places";
import type { DeviceProfile } from "../types/devices";
import { indicatorLegend } from "../types/indicator";

type DeviceLegendProps = {
  /** The profiles of the devices on screen; one line per profile. */
  profiles: DeviceProfile[];
  /** `inline` (default) is compact for overlays on the plan; `list` stacks every entry. */
  layout?: "list" | "inline";
  className?: string;
};

/**
 * What the colours on the plan mean, per device profile, in rule order. Fallbacks without their own label
 * are listed once at the end as "Unknown".
 */
export function DeviceLegend({ profiles, layout = "inline", className }: DeviceLegendProps) {
  const { t } = useTranslation("devices");
  if (profiles.length === 0) return null;
  const sharedUnknown = profiles.some((profile) => !profile.fallbackLabel);
  return (
    <div className={cn("flex flex-col", layout === "inline" ? "gap-1.5" : "gap-3", className)} aria-label={t("legend.title")}>
      {profiles.map((profile) => (
        <PlanLegend
          key={profile.id}
          title={profile.name}
          layout={layout}
          items={indicatorLegend(profile).flatMap((entry) => (entry.label ? [{ ...entry, label: entry.label }] : []))}
        />
      ))}
      {sharedUnknown && <PlanLegend layout={layout} items={[{ tone: "neutral", label: `${t("state.unknown")} / ${t("state.stale").toLowerCase()}` }]} />}
    </div>
  );
}
