import { CardHeading } from "@/components/shared/card";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { RecordLink } from "@/components/shared/record-link";
import { currentLocale } from "@/lib/i18n";
import { energyDistribution, type EnergyDistributionBranch } from "../types/energy-distribution";
import type { EnergyBreakdown } from "../types/energy";
import { formatKwh } from "./energy-format";

function Branch({ branch, depth = 0 }: { branch: EnergyDistributionBranch; depth?: number }) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  return <li className="min-w-0 rounded-xl border bg-card p-3">
    <Inline gap="sm" align="stretch" justify="between" wrap className="min-w-0">
      <RecordLink to={`/energy/appliances/${encodeURIComponent(branch.id)}`} className="min-w-0 break-words font-medium underline-offset-4 hover:underline">{branch.name}</RecordLink>
      <span className="break-words font-semibold tabular-nums">{branch.energyWh === null ? t("network.unknown") : formatKwh(branch.energyWh, locale)}</span>
    </Inline>
    {branch.energyWh === null && branch.accountedWh > 0 && <Text size="xs" tone="muted" className="mt-1">{t("hierarchy.knownSubtotal", { amount: formatKwh(branch.accountedWh, locale) })}</Text>}
    {branch.excessWh > 0 && <Text size="sm" tone="warning" role="status" className="mt-1">{t("hierarchy.excess", { amount: formatKwh(branch.excessWh, locale) })}</Text>}
    {branch.children.length > 0 && <ul className={`mt-3 flex min-w-0 flex-col gap-2 border-l border-section-border ${depth < 2 ? "ml-1 pl-3" : "pl-1"}`}>{branch.children.map((child) => <Branch key={child.id} branch={child} depth={depth + 1} />)}</ul>}
    <Inline gap="sm" align="stretch" justify="between" wrap className="mt-2 rounded-lg bg-muted/50 px-2 py-2 text-sm text-muted-foreground"><span>{t("hierarchy.other")}</span><span className="break-words tabular-nums">{branch.otherWh === null ? t("network.unknown") : formatKwh(branch.otherWh, locale)}</span></Inline>
  </li>;
}

/** Parent meters include their sub-meters. Every residual remains inside its own measured branch. */
export function EnergyMeterTree({ breakdown, className }: { breakdown: EnergyBreakdown; className?: string }) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  return <Card className={className}>
    <CardHeader className="flex-col gap-1"><CardHeading title={<>{t("breakdown.title")}</>} description={<>{t("hierarchy.description")}</>} /></CardHeader>
    {(breakdown.distributions ?? []).map((part) => {
      const flow = energyDistribution(part.totalWh, part.readings);
      return <section key={part.carrier} aria-label={t(`carriers.${part.carrier}`)} className="flex min-w-0 flex-col gap-3">
        <h3 className="font-semibold text-section-foreground">{t(`carriers.${part.carrier}`)}</h3>
        {flow.error ? <InlineAlert tone="error">{t(`hierarchy.errors.${flow.error}`)}</InlineAlert> : <>
          {flow.branches.length > 0 ? <ul className="flex min-w-0 flex-col gap-3">{flow.branches.map((branch) => <Branch key={branch.id} branch={branch} />)}</ul> : <Text size="sm" tone="muted">{t("hierarchy.noBranches")}</Text>}
          {flow.excessWh > 0 && <InlineAlert>{t("hierarchy.excess", { amount: formatKwh(flow.excessWh, locale) })}</InlineAlert>}
          <Inline gap="sm" align="stretch" justify="between" wrap className="rounded-xl border border-dashed p-3 text-sm"><span>{t("hierarchy.other")}</span><span className="break-words font-semibold tabular-nums">{flow.otherWh === null ? t("network.unknown") : formatKwh(flow.otherWh, locale)}</span></Inline>
        </>}
      </section>;
    })}
  </Card>;
}
