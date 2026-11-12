import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { FileUpIcon, FlameIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Await, useNavigation, useRevalidator } from "react-router";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PendingContent, SkeletonBlock, SkeletonTiles } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { currentLocale } from "@/lib/i18n";
import { useSamePagePending } from "@/lib/pending";
import { ApplianceBreakdown } from "../components/appliance-breakdown";
import { EnergyCarrierTabs } from "../components/energy-carrier-tabs";
import { EnergyNetwork } from "../components/energy-network";
import { EnergyFlowChart } from "../components/energy-flow-chart";
import { formatPeriod } from "../components/energy-format";
import { EnergyNav } from "../components/energy-nav";
import { EnergyPeriodNav } from "../components/energy-period-nav";
import { EnergyStatTiles } from "../components/energy-stat-tiles";
import { MonthlyPeakCard } from "../components/monthly-peak-card";
import type { EnergyOverview } from "../data/energy-loaders";
import { summaryViewSchema, type SummaryView } from "../types/energy";
import { energyPeriodSchema, periodRange, periodStart, type EnergyPeriod } from "../types/energy-period";

type EnergyOverviewScreenProps = {
  /** The summary and setup, or a promise of them: the page renders at once and shows skeletons meanwhile. */
  overview: EnergyOverview | Promise<EnergyOverview>;
  carrier: SummaryView;
  period: EnergyPeriod;
  /** First day of the period, `YYYY-MM-DD`. */
  date: string;
  /** Today in the household time zone, `YYYY-MM-DD`. */
  today: string;
  canManage: boolean;
  /** Force the "loading another period" look (stories). */
  pending?: boolean;
};

/** "Loading September 2026…" or "Loading gas…" for the period or tab being loaded. */
function usePendingLabel(current: { carrier: SummaryView; period: EnergyPeriod; date: string }) {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  const navigation = useNavigation();
  const params = navigation.location ? new URLSearchParams(navigation.location.search) : null;
  if (!params) return tCommon("loading.updating");
  const carrier = summaryViewSchema.catch(current.carrier).parse(params.get("carrier") ?? undefined);
  if (carrier !== current.carrier) return t("loading.carrier", { carrier: t(`carriers.${carrier}`).toLowerCase() });
  const period = energyPeriodSchema.catch(current.period).parse(params.get("period") ?? undefined);
  const date = periodStart(period, params.get("date") ?? current.date);
  const { from, to } = periodRange(period, date);
  return t("loading.period", { period: formatPeriod(period, from, to, currentLocale()) });
}

export function EnergyOverviewScreen({
  overview,
  carrier,
  period,
  date,
  today,
  canManage,
  pending: forcePending = false,
}: EnergyOverviewScreenProps) {
  const { t } = useTranslation("energy");
  const pending = useSamePagePending() || forcePending;
  const pendingLabel = usePendingLabel({ carrier, period, date });

  const importButton = canManage && (
    <Button asChild>
      <Link to="/energy/import">
        <FileUpIcon />
        {t(carrier === "gas" ? "empty.gas.import" : "empty.overview.import")}
      </Link>
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.overview.title")} description={t("page.overview.description")} actions={importButton} />
      <Stack gap="lg">
        <EnergyNav />
        <Stack gap="3">
          <EnergyCarrierTabs carrier={carrier} period={period} date={date} />
          <EnergyPeriodNav period={period} date={date} today={today} carrier={carrier} pending={pending} />
        </Stack>
      </Stack>

      <PendingContent pending={pending} label={pendingLabel}>
        <React.Suspense fallback={<EnergyOverviewSkeleton carrier={carrier} />}>
          <Await resolve={overview} errorElement={<EnergyOverviewError />}>
            {(data: EnergyOverview) => (
              <EnergyOverviewContent {...data} canManage={canManage} importButton={importButton} />
            )}
          </Await>
        </React.Suspense>
      </PendingContent>
    </PageContainer>
  );
}

/** Placeholders shaped like the tiles, the chart and the side cards. */
function EnergyOverviewSkeleton({ carrier }: { carrier: SummaryView }) {
  const { t } = useTranslation("energy");
  return (
    <Stack gap="8">
      <Text role="status" className="sr-only">
        {t("loading.overview")}
      </Text>
      <SkeletonTiles count={carrier === "gas" ? 2 : 4} />
      <PageGrid columns="main-sidebar">
        <Stack gap="lg" className="min-w-0">
          <SkeletonBlock className="h-[22rem]" />
          {carrier === "electricity" && <SkeletonBlock className="h-48" />}
        </Stack>
        <SkeletonBlock className={carrier === "electricity" ? "h-[26rem]" : "h-48"} />
      </PageGrid>
    </Stack>
  );
}

function EnergyOverviewError() {
  const { t } = useTranslation("energy");
  const { t: tCommon } = useTranslation();
  const revalidator = useRevalidator();
  return (
    <ErrorState
      title={t("loading.error")}
      description={tCommon("errors.generic")}
      action={
        <Button variant="outline" loading={revalidator.state !== "idle"} onClick={() => void revalidator.revalidate()}>
          {tCommon("actions.retry")}
        </Button>
      }
    />
  );
}

type EnergyOverviewContentProps = EnergyOverview & {
  canManage: boolean;
  importButton: React.ReactNode;
};

function EnergyOverviewContent({ summary, setup, canManage, importButton }: EnergyOverviewContentProps) {
  const { t } = useTranslation("energy");
  const { status, carrier } = summary;
  const totalKwp = setup.solarInstallations.reduce((sum, installation) => sum + installation.kwp, 0);
  const hasData =
    carrier === "gas"
      ? status.hasGasData || summary.breakdown.appliances.length > 0
      : carrier === "total"
        ? status.hasElectricityData || status.hasGasData
        : status.hasGridData || status.solarMeasured || summary.breakdown.appliances.length > 0;
  // Solar and battery only matter where electricity is counted.
  const electricityCounts = carrier === "electricity" || (carrier === "total" && status.hasElectricityData);

  if (!hasData) {
    return carrier === "gas" ? (
      <EmptyState icon={FlameIcon} title={t("empty.gas.title")} description={t("empty.gas.description")} action={importButton} />
    ) : (
      <EmptyState
        icon={ZapIcon}
        title={t("empty.overview.title")}
        description={t("empty.overview.description")}
        action={
          canManage && (
            <Inline gap="sm" align="stretch" justify="center" wrap>
              {importButton}
              {!status.hasSolar && (
                <Button asChild variant="outline">
                  <Link to="/energy/setup">{t("empty.overview.setup")}</Link>
                </Button>
              )}
              {status.applianceCount === 0 && (
                <Button asChild variant="outline">
                  <Link to="/energy/appliances">{t("empty.overview.appliances")}</Link>
                </Button>
              )}
            </Inline>
          )
        }
      />
    );
  }

  return (
    <Stack gap="8">
      {electricityCounts && status.hasSolar && !status.solarMeasured && (
        <InlineAlert>
          <Text weight="medium">{t("notices.solarNotMeasured.title")}</Text>
          <Text tone="muted">{t("notices.solarNotMeasured.description")}</Text>
        </InlineAlert>
      )}
      {electricityCounts && status.hasBattery && !status.batteryMeasured && (
        <InlineAlert>
          <Text weight="medium">{t("notices.batteryNotMeasured.title")}</Text>
          <Text tone="muted">{t("notices.batteryNotMeasured.description")}</Text>
        </InlineAlert>
      )}
      {carrier === "total" && (!status.hasElectricityData || !status.hasGasData) && (
        <InlineAlert>{t(status.hasGasData ? "notices.totalWithoutElectricity" : "notices.totalWithoutGas")}</InlineAlert>
      )}

      <EnergyStatTiles summary={summary} totalKwp={totalKwp || undefined} />
      <EnergyNetwork summary={summary} />

      {carrier === "electricity" ? (
        <PageGrid columns="main-sidebar">
          <Stack gap="lg" className="min-w-0">
            <EnergyFlowChart summary={summary} />
            <ApplianceBreakdown breakdown={summary.breakdown} />
          </Stack>
          {/* The capacity tariff is about electricity only. */}
          <MonthlyPeakCard peak={summary.peak} className="min-w-0 self-start" />
        </PageGrid>
      ) : (
        <PageGrid columns="main-sidebar">
          <EnergyFlowChart summary={summary} className="min-w-0" />
          <ApplianceBreakdown breakdown={summary.breakdown} className="min-w-0 self-start" />
        </PageGrid>
      )}
    </Stack>
  );
}
