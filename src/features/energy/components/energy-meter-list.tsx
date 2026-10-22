import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { intlLocale } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { Appliance, EnergyMeter } from "../types/energy";
import { zonedDateTime } from "../types/energy-time";
import { CarrierBadge } from "./carrier-badge";

type EnergyMeterListProps = {
  meters: EnergyMeter[];
  /** To name appliance meters. */
  appliances: Pick<Appliance, "id" | "name">[];
};

/** Every data channel with its source and the period it covers, so you can see what is missing. */
export function EnergyMeterList({ meters, appliances }: EnergyMeterListProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const names = new Map(appliances.map((appliance) => [appliance.id, appliance.name]));
  const day = (iso: string) => formatDate(zonedDateTime(iso).date, locale);

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("meters.title")}</CardTitle>
        <CardDescription>{t("meters.description")}</CardDescription>
      </CardHeader>
      {meters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("meters.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {meters.map((meter) => (
            <li key={meter.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {(meter.applianceId && names.get(meter.applianceId)) ||
                  (meter.carrier === "gas" ? t("readingMeters.gas") : t(`kinds.${meter.kind}`))}
                {meter.register !== "single" && ` · ${t(`registers.${meter.register}`)}`}
              </span>
              <CarrierBadge carrier={meter.carrier} />
              <Badge variant="outline" className="font-normal">
                {t(`sources.${meter.source}`)}
              </Badge>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">
                {t("meters.intervals", { count: meter.intervalCount, number: meter.intervalCount.toLocaleString(intlLocale(locale)) })}
                {meter.firstAt && meter.lastAt && ` · ${t("meters.range", { from: day(meter.firstAt), to: day(new Date(Date.parse(meter.lastAt) - 1).toISOString()) })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
