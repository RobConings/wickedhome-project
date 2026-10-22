import { GaugeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { StackedBarChart } from "@/components/shared/stacked-bar-chart";
import { intlLocale } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate, formatMonthName } from "@/types/date-format";
import { CAPACITY_MINIMUM_KW, type EnergyPeak } from "../types/energy";
import { zonedDateTime } from "../types/energy-time";
import { formatKw, formatMonth } from "./energy-format";

type MonthlyPeakCardProps = {
  peak: EnergyPeak;
  className?: string;
};

/** The Flemish capacity tariff at a glance: this month's highest quarter-hour and the last 12 months. */
export function MonthlyPeakCard({ peak, className }: MonthlyPeakCardProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const when = peak.at ? zonedDateTime(peak.at) : null;
  const hasHistory = peak.history.some((month) => month.kw !== null);

  return (
    <Card className={className}>
      <CardHeader className="flex-col gap-1">
        <CardTitle className="flex items-center gap-2">
          <GaugeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("peak.title")} · {formatMonth(peak.month, locale)}
        </CardTitle>
        <CardDescription>{t("peak.description")}</CardDescription>
      </CardHeader>

      {peak.kw === null ? (
        <p className="text-sm text-muted-foreground">{t("peak.none", { month: formatMonth(peak.month, locale) })}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-4xl font-semibold tracking-tight">{formatKw(peak.kw, locale)}</p>
          {when && (
            <p className="text-sm text-muted-foreground">
              {t("peak.at", {
                date: formatDate(when.date, locale),
                time: when.time,
              })}
            </p>
          )}
          <p className="text-sm">
            {peak.kw < CAPACITY_MINIMUM_KW ? t("peak.minimum") : t("peak.billed", { kw: formatKw(peak.billedKw, locale) })}
          </p>
          {peak.rollingAverageKw !== null && (
            <p className="text-sm text-muted-foreground">
              {t("peak.rollingAverage", { kw: formatKw(peak.rollingAverageKw, locale) })}
            </p>
          )}
        </div>
      )}

      {hasHistory && (
        <StackedBarChart
          title={t("peak.history")}
          height={120}
          series={[{ key: "kw", label: t("peak.series"), color: "var(--chart-1)" }]}
          data={peak.history.map((month) => ({
            key: month.month,
            label: formatMonthName(Number(month.month.slice(5, 7)), locale, "narrow"),
            title: formatMonth(month.month, locale),
            values: { kw: month.kw },
          }))}
          formatValue={(kw) => formatKw(kw, locale)}
          formatTick={(kw) => new Intl.NumberFormat(intlLocale(locale)).format(kw)}
          axisLabel="kW"
          referenceLine={{ value: CAPACITY_MINIMUM_KW, label: formatKw(CAPACITY_MINIMUM_KW, locale) }}
          labels={{ showTable: t("chart.showTable"), hideTable: t("chart.hideTable"), category: t("chart.category") }}
        />
      )}
    </Card>
  );
}
