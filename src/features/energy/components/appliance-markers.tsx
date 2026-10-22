import { GaugeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Appliance } from "../types/energy";
import { CarrierBadge } from "./carrier-badge";
import { formatWatts } from "./energy-format";

/** What an appliance runs on and whether a meter measures it, as badges. */
export function ApplianceMarkers({ appliance }: { appliance: Pick<Appliance, "carriers" | "measured"> }) {
  const { t } = useTranslation("energy");
  return (
    <>
      {appliance.carriers.map((carrier) => (
        <CarrierBadge key={carrier} carrier={carrier} />
      ))}
      {appliance.measured ? (
        <Badge variant="secondary" className="gap-1 font-normal">
          <GaugeIcon aria-hidden="true" />
          {t("appliances.measured")}
        </Badge>
      ) : (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {t("appliances.notMeasured")}
        </Badge>
      )}
    </>
  );
}

type ApplianceSummaryProps = {
  appliance: Pick<Appliance, "category" | "ratedPowerW" | "standbyPowerW">;
  className?: string;
};

/** Category and power figures in one line: "Laundry · 2.500 W rated · 1 W standby". */
export function ApplianceSummary({ appliance, className }: ApplianceSummaryProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const details = [
    t(`categories.${appliance.category}`),
    appliance.ratedPowerW != null && t("appliances.rated", { power: formatWatts(appliance.ratedPowerW, locale) }),
    appliance.standbyPowerW != null && t("appliances.standby", { power: formatWatts(appliance.standbyPowerW, locale) }),
  ].filter(Boolean);
  return <p className={cn("text-sm text-muted-foreground", className)}>{details.join(" · ")}</p>;
}
