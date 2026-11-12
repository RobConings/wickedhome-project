import { PageGrid } from "@/components/layout/page-grid";
import { Text } from "@/components/ui/text";
import { ArrowDownIcon, ArrowRightIcon, BatteryChargingIcon, FlameIcon, HouseIcon, SunIcon, UtilityPoleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { RecordLink } from "@/components/shared/record-link";
import { currentLocale } from "@/lib/i18n";
import type { EnergySummary, MeterKind } from "../types/energy";
import { formatKwh } from "./energy-format";

/** Period energy in kWh, never an invented live-power reading or an inferred device control. */
export function EnergyNetwork({ summary }: { summary: EnergySummary }) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const { carrier, totals, status } = summary;
  const value = (wh: number | null) => wh === null ? t("network.unknown") : formatKwh(wh, locale);
  const measured = (kind: MeterKind, wh: number | null) => status.channels
    ? status.channels.some((channel) => channel.carrier === carrier && channel.kind === kind) ? wh : null
    : wh;
  const totalParts = summary.breakdown.distributions ?? (["electricity", "gas"] as const).map((part) => {
    const values = summary.series.map((point) => point[part === "gas" ? "gasWh" : "electricityWh"]).filter((wh): wh is number => wh !== null);
    return { carrier: part, totalWh: values.length ? values.reduce((sum, wh) => sum + wh, 0) : null };
  });
  const sourceNodes = carrier === "total"
    ? totalParts.map((part) => ({ id: part.carrier, label: t(`carriers.${part.carrier}`), icon: part.carrier === "gas" ? FlameIcon : UtilityPoleIcon, wh: part.totalWh }))
    : [{ id: "grid_import", label: t(carrier === "gas" ? "carriers.gas" : "kinds.grid_import"), icon: carrier === "gas" ? FlameIcon : UtilityPoleIcon, wh: measured("grid_import", totals.importWh) },
      ...(carrier === "electricity" && (status.hasSolar || status.solarMeasured) ? [{ id: "solar_production", label: t("kinds.solar_production"), icon: SunIcon, wh: measured("solar_production", totals.solarWh) }] : []),
      ...(carrier === "electricity" && (status.hasBattery || status.batteryMeasured) ? [{ id: "battery_discharge", label: t("kinds.battery_discharge"), icon: BatteryChargingIcon, wh: measured("battery_discharge", totals.batteryDischargeWh) }] : [])];
  const destinations = carrier === "electricity" ? [
    { id: "grid_export", label: t("kinds.grid_export"), wh: measured("grid_export", totals.exportWh) },
    ...(status.hasBattery || status.batteryMeasured ? [{ id: "battery_charge", label: t("kinds.battery_charge"), wh: measured("battery_charge", totals.batteryChargeWh) }] : []),
  ] : [];
  return <Card>
    <CardHeader><div><CardTitle>{t("network.title")}</CardTitle><CardDescription>{t("network.description")}</CardDescription></div></CardHeader>
    <PageGrid gap="3" className="min-w-0 rounded-2xl bg-section-soft/40 p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
      <ul className="flex min-w-0 flex-col gap-2">{sourceNodes.map((node) => <li key={node.id} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3">
        <IconChip icon={node.icon} tone="energy" size="sm" /><div className="min-w-0"><Text size="sm" tone="muted" className="break-words">{node.label}</Text><Text weight="semibold" className="break-words tabular-nums">{value(node.wh)}</Text></div>
      </li>)}</ul>
      <ArrowDownIcon className="mx-auto size-5 text-section md:hidden" aria-hidden="true" /><ArrowRightIcon className="hidden size-5 text-section md:block" aria-hidden="true" />
      <div className="min-w-0 rounded-xl border border-section-border bg-card p-4 text-center"><HouseIcon className="mx-auto mb-2 size-8 text-section" aria-hidden="true" /><Text weight="semibold" className="break-words">{t("network.home")}</Text><Text size="xl" weight="semibold" className="break-words tabular-nums">{value(totals.consumptionWh)}</Text><Text size="xs" tone="muted" className="mt-1">{t("network.recorded")}</Text></div>
      {destinations.length > 0 && <><ArrowDownIcon className="mx-auto size-5 text-section md:hidden" aria-hidden="true" /><ArrowRightIcon className="hidden size-5 text-section md:block" aria-hidden="true" /><ul className="flex min-w-0 flex-col gap-2">{destinations.map((node) => <li key={node.id} className="min-w-0 rounded-xl border bg-card p-3"><Text size="sm" tone="muted" className="break-words">{node.label}</Text><Text weight="semibold" className="break-words tabular-nums">{value(node.wh)}</Text></li>)}</ul></>}
    </PageGrid>
    {status.channels && <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t("network.sources")}</summary><Text size="sm" tone="muted" className="mb-3">{t("network.coverageHint")}</Text><ul className="divide-y">{status.channels.filter((channel) => carrier === "total" || channel.carrier === carrier).map((channel) => <li key={`${channel.carrier}:${channel.kind}`} className="py-2 text-sm"><Text weight="medium">{t(`carriers.${channel.carrier}`)} · {t(`kinds.${channel.kind}`)}</Text><Text tone="muted" className="break-words">{channel.sources.map((source) => t(`sources.${source}`)).join(" · ")} · {t("network.coverage", { count: channel.buckets, total: summary.series.length })}</Text></li>)}</ul></details>}
    <RecordLink to="/energy/appliances" className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline">{t("network.manageBranches")}</RecordLink>
  </Card>;
}
