import { SigmaIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";
import { SUMMARY_VIEWS, type SummaryView } from "../types/energy";
import type { EnergyPeriod } from "../types/energy-period";
import { CARRIER_ICONS } from "./carrier-icons";

type EnergyCarrierTabsProps = {
  carrier: SummaryView;
  period: EnergyPeriod;
  /** First day of the shown period; switching carrier keeps the period. */
  date: string;
  className?: string;
};

const ICONS = { electricity: CARRIER_ICONS.electricity, gas: CARRIER_ICONS.gas, total: SigmaIcon } as const;

/** Electricity | Gas | Total energy, plus water as "coming later". State lives in the URL. */
export function EnergyCarrierTabs({ carrier, period, date, className }: EnergyCarrierTabsProps) {
  const { t } = useTranslation("energy");
  const tab =
    "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors [&_svg]:size-4";
  const WaterIcon = CARRIER_ICONS.water;
  return (
    // One pill row that scrolls inside itself when it doesn't fit (phones); the links are focusable.
    <ScrollRow
      label={t("carriers.label")}
      gap="xs"
      focusable={false}
      className={cn("inline-flex h-9 w-fit gap-0 rounded-lg bg-muted p-[3px]", className)}
    >
        {SUMMARY_VIEWS.map((value) => {
          const Icon = ICONS[value];
          return (
            <Link
              key={value}
              to={`/energy?carrier=${value}&period=${period}&date=${date}`}
              aria-current={value === carrier ? "true" : undefined}
              className={cn(
                tab,
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                value === carrier ? "bg-background text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" />
              {t(`carriers.${value}`)}
            </Link>
          );
        })}
        <span aria-disabled="true" className={cn(tab, "cursor-default text-muted-foreground/70")}>
          <WaterIcon aria-hidden="true" />
          {t("carriers.water")}
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
            {t("carriers.soon")}
          </Badge>
        </span>
    </ScrollRow>
  );
}
