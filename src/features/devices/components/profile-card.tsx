import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import type { DeviceProfile } from "../types/devices";
import { indicatorLegend } from "../types/indicator";
import { DeviceIcon } from "./device-icon";

type ProfileCardProps = {
  profile: DeviceProfile;
  /** A tile, or the content of a list row (the list draws the dividers and padding). */
  variant?: "card" | "row";
  className?: string;
};

/** A device profile in the list: icon, name, category, counts and its colours. Links to the editor. */
export function ProfileCard({ profile, variant = "card", className }: ProfileCardProps) {
  const { t } = useTranslation("devices");
  const href = `/devices/profiles/${profile.id}`;
  const icon = (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
      <DeviceIcon icon={profile.icon} className="size-5" />
    </span>
  );
  const details = (
    <>
      {t(`categories.${profile.category}`)} · {t("profiles.fieldCount", { count: profile.fields.length })} ·{" "}
      {t("profiles.ruleCount", { count: profile.rules.length })} · {t("profiles.deviceCount", { count: profile.deviceCount })}
    </>
  );
  const legend = (
    <span className="flex flex-wrap gap-1" aria-hidden="true">
      {indicatorLegend(profile).map((entry) => (
        <PlanMarkerDot key={`${entry.tone}-${entry.color ?? ""}-${entry.label ?? ""}`} tone={entry.tone} color={entry.color} />
      ))}
    </span>
  );

  if (variant === "row") {
    return (
      <Link
        to={href}
        className={cn(
          "-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
          className,
        )}
      >
        {icon}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{profile.name}</span>
          <span className="truncate text-xs text-muted-foreground">{details}</span>
          {legend}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Card className={cn("relative gap-3 p-4 transition-colors hover:bg-accent/50", className)}>
      {icon}
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={href}
          className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {profile.name}
        </Link>
        <span className="line-clamp-3 text-xs text-muted-foreground">{details}</span>
      </div>
      <div className="mt-auto">{legend}</div>
    </Card>
  );
}
