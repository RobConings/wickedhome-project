import { ArrowRightIcon, FlameIcon, ZapIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "./card";
import { IconChip } from "./icon-chip";
import { InlineAlert } from "./inline-alert";
import { formatKwh, formatM3 } from "@/features/energy";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { energyFigures, gasFigures, type DashboardEnergy } from "../data/dashboard-items";

type EnergyCardProps = {
  today: string;
  /**
   * This month's electricity summary, with gas under `gas`; `null` when electricity failed to load. A
   * missing or failed gas summary only leaves the gas figures out.
   */
  summary: DashboardEnergy | null;
};

type Figure = { label: string; value: string; detail?: string | null };

/** "Electricity" / "Gas" above a pair of figures (only when both carriers are shown). */
function CarrierLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function FigurePair({ figures }: { figures: [Figure, Figure] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {figures.map((figure) => (
        <div key={figure.label} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{figure.label}</span>
          <span className="text-xl font-semibold tracking-tight tabular-nums">{figure.value}</span>
          {figure.detail && <span className="text-xs text-muted-foreground tabular-nums">{figure.detail}</span>}
        </div>
      ))}
    </div>
  );
}

/** Today's and this month's usage (electricity, and gas when the house has it), self-sufficiency and the capacity-tariff peak. */
export function EnergyCard({ today, summary }: EnergyCardProps) {
  const { t } = useTranslation("dashboard");
  const locale = currentLocale();
  const kwh = (wh: number | null) => (wh === null ? "–" : formatKwh(wh, locale));
  const m3 = (litres: number | null) => (litres === null ? null : formatM3(litres, locale));
  const figures = summary ? energyFigures(summary, today) : null;
  const gas = summary ? gasFigures(summary.gas, today) : null;
  const hasAnyData = Boolean(figures?.hasData || gas);

  const electricityLabel = (label: string) => (figures?.gridOnly ? `${label} · ${t("energy.gridOnly")}` : label);

  return (
    <Card>
      <CardHeader className="items-center justify-start gap-3">
        <IconChip icon={ZapIcon} tone="highlight" size="sm" />
        <CardTitle>{t("energy.title")}</CardTitle>
      </CardHeader>

      {!figures ? (
        <InlineAlert tone="error">{t("loadError")}</InlineAlert>
      ) : !hasAnyData ? (
        <p className="text-sm text-muted-foreground">{t("energy.noData")}</p>
      ) : (
        <>
          {figures.hasData && (
            <div className="flex flex-col gap-1.5">
              {gas && <CarrierLabel icon={ZapIcon} label={t("energy.electricity")} />}
              <FigurePair
                figures={[
                  { label: electricityLabel(t("energy.today")), value: kwh(figures.todayWh) },
                  { label: electricityLabel(t("energy.month")), value: kwh(figures.monthWh) },
                ]}
              />
            </div>
          )}
          {gas && (
            <div className={figures.hasData ? "flex flex-col gap-1.5 border-t pt-3" : "flex flex-col gap-1.5"}>
              <CarrierLabel icon={FlameIcon} label={t("energy.gas")} />
              <FigurePair
                figures={[
                  { label: t("energy.today"), value: kwh(gas.todayWh), detail: m3(gas.todayLitres) },
                  { label: t("energy.month"), value: kwh(gas.monthWh), detail: m3(gas.monthLitres) },
                ]}
              />
            </div>
          )}
          {figures.hasData && (
            <dl className="flex flex-col divide-y border-t text-sm">
              {[
                figures.solarShare !== null && {
                  term: t("energy.solarShare"),
                  value: new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(
                    figures.solarShare,
                  ),
                },
                {
                  term: t("energy.peak"),
                  value:
                    figures.peakKw === null
                      ? t("energy.noPeak")
                      : `${new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(figures.peakKw)} kW`,
                },
              ]
                .filter((row): row is { term: string; value: string } => row !== false)
                .map((row) => (
                  <div key={row.term} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{row.term}</dt>
                    <dd className="font-medium tabular-nums">{row.value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </>
      )}

      <CardFooter>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to={figures && !hasAnyData ? "/energy/import" : "/energy"}>
            {figures && !hasAnyData ? t("energy.import") : t("energy.view")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
