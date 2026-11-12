import { CardHeading } from "@/components/shared/card";
import { Text } from "@/components/ui/text";
import { CircleHelpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BreakdownBars, type BreakdownItem } from "@/components/shared/breakdown-bars";
import { Card, CardHeader } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { currentLocale } from "@/lib/i18n";
import type { EnergyBreakdown } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { EnergyMeterTree } from "./energy-meter-tree";
import { formatKwh, formatPercent } from "./energy-format";

type ApplianceBreakdownProps = {
  breakdown: EnergyBreakdown;
  className?: string;
};

/** Consumption per measured appliance, plus Unknown for everything no meter accounts for. */
export function ApplianceBreakdown({ breakdown, className }: ApplianceBreakdownProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  if (breakdown.distributions) return <EnergyMeterTree breakdown={breakdown} className={className} />;
  const total = breakdown.totalWh;
  const share = (wh: number) => (total ? formatPercent(wh / total, locale) : undefined);

  const items: BreakdownItem[] = breakdown.appliances.map((appliance) => ({
    key: appliance.applianceId,
    label: appliance.name,
    leading: <ApplianceCategoryIcon category={appliance.category} />,
    value: appliance.energyWh,
    valueLabel: formatKwh(appliance.energyWh, locale),
    shareLabel: share(appliance.energyWh),
  }));
  if (breakdown.unknownWh !== null && total) {
    items.push({
      key: "unknown",
      label: t("breakdown.unknown"),
      leading: <CircleHelpIcon className="size-4" aria-hidden="true" />,
      value: breakdown.unknownWh,
      valueLabel: formatKwh(breakdown.unknownWh, locale),
      shareLabel: share(breakdown.unknownWh),
      muted: true,
    });
  }

  return (
    <Card className={className}>
      <CardHeader className="flex-col gap-1">
        <CardHeading title={<>{t("breakdown.title")}</>} description={<>{t("breakdown.description")}</>} />
      </CardHeader>
      {total === null && <InlineAlert>{t("breakdown.noConsumption")}</InlineAlert>}
      {total === 0 && <Text size="sm" tone="muted">{t("breakdown.noData")}</Text>}
      {items.length > 0 && <BreakdownBars items={items} max={total || undefined} label={t("breakdown.label")} />}
      {total !== null && total > 0 && breakdown.appliances.length === 0 && (
        <Text size="sm" tone="muted">{t("breakdown.allUnknown")}</Text>
      )}
    </Card>
  );
}
