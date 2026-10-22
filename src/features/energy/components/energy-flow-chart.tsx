import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "./card";
import { StackedBarChart, type StackedBarDatum, type StackedBarSeries } from "./stacked-bar-chart";
import { currentLocale } from "@/lib/i18n";
import type { EnergySummary } from "../types/energy";
import { formatBucket, formatKwh, formatKwhAxis } from "./energy-format";

type EnergyFlowChartProps = {
  summary: Pick<EnergySummary, "carrier" | "period" | "series" | "status">;
  className?: string;
};

/**
 * Above the baseline, where the energy the house used came from (grid, own solar, battery); below it,
 * where surplus went (injection, battery). With grid data only: import above, injection below.
 */
export function EnergyFlowChart({ summary, className }: EnergyFlowChartProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const { solarMeasured, batteryMeasured } = summary.status;

  // Order = stacking order from the baseline out; colours follow the series, never the rank.
  // Electricity is blue and gas orange in every view, so a carrier keeps its colour across tabs.
  const carrierSeries: StackedBarSeries[] =
    summary.carrier === "gas"
      ? [{ key: "gas", label: t("carriers.gas"), color: "var(--chart-2)" }]
      : [
          { key: "electricity", label: t("carriers.electricity"), color: "var(--chart-1)" },
          { key: "gas", label: t("carriers.gas"), color: "var(--chart-2)" },
        ];
  const flowSeries: StackedBarSeries[] = [
    { key: "import", label: t("chart.import"), color: "var(--chart-1)" },
    ...(solarMeasured ? [{ key: "solar", label: t("chart.solar"), color: "var(--chart-4)" }] : []),
    ...(batteryMeasured ? [{ key: "batteryOut", label: t("chart.batteryOut"), color: "var(--chart-3)" }] : []),
    { key: "export", label: t("chart.export"), color: "var(--chart-2)", direction: "down" as const },
    ...(batteryMeasured
      ? [{ key: "batteryIn", label: t("chart.batteryIn"), color: "var(--chart-7)", direction: "down" as const }]
      : []),
  ];
  const series = summary.carrier === "electricity" ? flowSeries : carrierSeries;

  const data: StackedBarDatum[] = summary.series.map((point) => {
    const label = formatBucket(point.label, summary.period, locale);
    const solarDirect =
      point.solarWh === null ? null : Math.max(0, point.solarWh - point.exportWh - (point.batteryChargeWh ?? 0));
    return {
      key: point.label,
      label: label.short,
      title: label.long,
      values: {
        import: point.importWh,
        solar: solarDirect,
        batteryOut: point.batteryDischargeWh,
        export: point.exportWh,
        batteryIn: point.batteryChargeWh,
        electricity: point.electricityWh,
        gas: point.gasWh,
      },
    };
  });

  return (
    <Card className={className}>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t(summary.carrier === "electricity" ? "chart.title" : "chart.consumptionTitle")}</CardTitle>
        <CardDescription>
          {summary.carrier === "gas"
            ? t("chart.descriptionGas")
            : summary.carrier === "total"
              ? t("chart.descriptionTotal")
              : solarMeasured
                ? t("chart.description")
                : t("chart.descriptionGridOnly")}
        </CardDescription>
      </CardHeader>
      <StackedBarChart
        title={t("chart.title")}
        series={series}
        data={data}
        formatValue={(wh) => formatKwh(wh, locale)}
        formatTick={(wh) => formatKwhAxis(wh, locale)}
        axisLabel="kWh"
        labels={{ showTable: t("chart.showTable"), hideTable: t("chart.hideTable"), category: t("chart.category") }}
      />
    </Card>
  );
}
