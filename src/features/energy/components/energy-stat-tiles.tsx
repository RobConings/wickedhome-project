import {
  ArrowUpFromLineIcon,
  BatteryChargingIcon,
  CylinderIcon,
  FlameIcon,
  HouseIcon,
  LeafIcon,
  RecycleIcon,
  SunIcon,
  UtilityPoleIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatTile } from "./stat-tile";
import { currentLocale } from "@/lib/i18n";
import type { EnergySummary } from "../types/energy";
import { formatCalorific, formatKwh, formatKwp, formatM3, formatPercent } from "./energy-format";

type EnergyStatTilesProps = {
  summary: Pick<EnergySummary, "carrier" | "totals" | "status" | "series">;
  /** Installed solar peak power, for the solar tile's hint. */
  totalKwp?: number;
};

/** The period's key figures. Figures that can't be computed say so instead of showing a wrong number. */
export function EnergyStatTiles({ summary, totalKwp }: EnergyStatTilesProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const { totals, status } = summary;
  const kwh = (wh: number) => formatKwh(wh, locale);
  const showBattery = status.hasBattery || status.batteryMeasured;
  const showSolar = status.hasSolar || status.solarMeasured;
  const consumed = (
    <StatTile
      label={t(summary.carrier === "total" ? "stats.totalConsumption" : "stats.consumption")}
      value={totals.consumptionWh === null ? "–" : kwh(totals.consumptionWh)}
      hint={
        totals.consumptionWh === null
          ? t("stats.consumptionUnknown")
          : totals.volumeLitres !== null
            ? formatM3(totals.volumeLitres, locale)
            : undefined
      }
      icon={HouseIcon}
      tone="featured"
    />
  );

  if (summary.carrier === "gas") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {consumed}
        {totals.volumeLitres !== null && (
          <StatTile
            label={t("stats.gasVolume")}
            value={formatM3(totals.volumeLitres, locale)}
            hint={
              totals.calorificKwhPerM3 !== null
                ? t("stats.calorific", { value: formatCalorific(totals.calorificKwhPerM3, locale) })
                : undefined
            }
            icon={CylinderIcon}
          />
        )}
      </div>
    );
  }

  if (summary.carrier === "total") {
    const sum = (key: "electricityWh" | "gasWh") =>
      summary.series.some((point) => point[key] === null)
        ? null
        : summary.series.reduce((total, point) => total + (point[key] ?? 0), 0);
    const electricity = status.hasElectricityData ? sum("electricityWh") : null;
    const gas = status.hasGasData ? sum("gasWh") : null;
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {consumed}
        <StatTile
          label={t("carriers.electricity")}
          value={electricity === null ? "–" : kwh(electricity)}
          hint={!status.hasElectricityData ? t("stats.noData") : electricity === null ? t("stats.consumptionUnknown") : undefined}
          icon={ZapIcon}
        />
        <StatTile
          label={t("carriers.gas")}
          value={gas === null ? "–" : kwh(gas)}
          hint={!status.hasGasData ? t("stats.noData") : undefined}
          icon={FlameIcon}
        />
        {showSolar && totals.solarWh !== null && <StatTile label={t("stats.solar")} value={kwh(totals.solarWh)} icon={SunIcon} />}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {consumed}
      <StatTile
        label={t("stats.import")}
        value={kwh(totals.importWh)}
        hint={
          totals.importDayWh || totals.importNightWh
            ? t("stats.importSplit", { day: kwh(totals.importDayWh), night: kwh(totals.importNightWh) })
            : undefined
        }
        icon={UtilityPoleIcon}
      />
      <StatTile label={t("stats.export")} value={kwh(totals.exportWh)} icon={ArrowUpFromLineIcon} tone={totals.exportWh > 0 ? "positive" : "default"} />
      {showSolar && (
        <StatTile
          label={t("stats.solar")}
          value={totals.solarWh === null ? "–" : kwh(totals.solarWh)}
          hint={
            totals.solarWh === null
              ? t("stats.solarNotMeasured")
              : totalKwp
                ? t("stats.solarKwp", { kwp: formatKwp(totalKwp, locale) })
                : undefined
          }
          icon={SunIcon}
        />
      )}
      {showBattery && (
        <StatTile
          label={t("stats.battery")}
          value={
            totals.batteryDischargeWh === null ? "–" : kwh(totals.batteryDischargeWh)
          }
          hint={
            totals.batteryChargeWh === null || totals.batteryDischargeWh === null
              ? t("stats.solarNotMeasured")
              : t("stats.batteryInOut", { charge: kwh(totals.batteryChargeWh), discharge: kwh(totals.batteryDischargeWh) })
          }
          icon={BatteryChargingIcon}
        />
      )}
      {totals.selfSufficiency !== null && (
        <StatTile
          label={t("stats.selfSufficiency")}
          value={formatPercent(totals.selfSufficiency, locale)}
          hint={t("stats.selfSufficiencyHint")}
          icon={LeafIcon}
        />
      )}
      {totals.selfConsumption !== null && (
        <StatTile
          label={t("stats.selfConsumption")}
          value={formatPercent(totals.selfConsumption, locale)}
          hint={t("stats.selfConsumptionHint")}
          icon={RecycleIcon}
        />
      )}
    </div>
  );
}
