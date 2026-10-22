import * as React from "react";
import { useTranslation } from "react-i18next";
import { Await, useFetcher } from "react-router";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SkeletonBlock, SkeletonList } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import type { Appliance } from "@/features/energy";
import { AlarmCard } from "../components/alarm-card";
import { AlarmCardSkeleton } from "../components/alarm-card-skeleton";
import { AlarmLogList } from "../components/alarm-log-list";
import { HaDeviceImport } from "../components/ha-device-import";
import { HaEnergyPanel } from "../components/ha-energy-panel";
import { HaEntityBrowser } from "../components/ha-entity-browser";
import { HomeAssistantIntegrationCard } from "../components/home-assistant-integration-card";
import type { HomeAssistantActionResult } from "../data/home-assistant-loaders";
import type { AlarmOverview, HaConnectionStatus, HaEnergyOverview, HaEntitiesResponse, HaSuggestionsResponse } from "../types/home-assistant";

type HomeAssistantScreenProps = {
  status: HaConnectionStatus;
  entities: Promise<HaEntitiesResponse | null> | HaEntitiesResponse | null;
  suggestions: Promise<HaSuggestionsResponse | null> | HaSuggestionsResponse | null;
  energy: Promise<HaEnergyOverview | null> | HaEnergyOverview | null;
  alarm: Promise<AlarmOverview | null> | AlarmOverview | null;
  appliances: Promise<Appliance[]> | Appliance[];
  canManage: boolean;
  /** Live updates (off in Storybook). */
  live?: boolean;
};

/**
 * `/home-assistant`: the connection, the alarm, importing devices from Home Assistant's entities, the energy
 * statistics and their appliances, all entities, and the alarm's audit log. While Home Assistant isn't
 * configured only the card with the setup steps shows.
 */
export function HomeAssistantScreen({ status, entities, suggestions, energy, alarm, appliances, canManage, live = true }: HomeAssistantScreenProps) {
  const { t } = useTranslation("home-assistant");
  const configured = status.state !== "not_configured";
  const failed = <InlineAlert tone="error">{t("page.loadFailed")}</InlineAlert>;
  // One stable promise for both, so the panel doesn't suspend again on every render.
  const energyData = React.useMemo(() => Promise.all([energy, appliances]), [energy, appliances]);

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} />

      <PageGrid columns="main-sidebar">
        <HomeAssistantIntegrationCard status={status} canManage={canManage} showPageLink={false} live={live} />
        {configured && (
          <React.Suspense fallback={<AlarmCardSkeleton />}>
            <Await resolve={alarm} errorElement={null}>
              {(overview) => <AlarmCard overview={overview} canControl={canManage} live={live} />}
            </Await>
          </React.Suspense>
        )}
      </PageGrid>

      {configured && (
        <>
          {canManage && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1">
                  <CardTitle>{t("import.title")}</CardTitle>
                  <CardDescription>{t("import.description")}</CardDescription>
                </div>
              </CardHeader>
              <React.Suspense fallback={<SkeletonList rows={4} />}>
                <Await resolve={suggestions} errorElement={failed}>
                  {(data) =>
                    data && data.status.state === "connected" ? <HaDeviceImport suggestions={data.suggestions} canManage={canManage} /> : <InlineAlert>{t("page.notConnected")}</InlineAlert>
                  }
                </Await>
              </React.Suspense>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle>{t("energy.title")}</CardTitle>
                <CardDescription>{t("energy.description")}</CardDescription>
              </div>
            </CardHeader>
            <React.Suspense fallback={<SkeletonBlock className="h-48" />}>
              <Await resolve={energyData} errorElement={failed}>
                {([overview, list]) => (overview ? <HaEnergyPanel energy={overview} appliances={list} canManage={canManage} /> : failed)}
              </Await>
            </React.Suspense>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1">
                  <CardTitle>{t("entities.title")}</CardTitle>
                  <CardDescription>{t("entities.description")}</CardDescription>
                </div>
              </CardHeader>
              <React.Suspense fallback={<SkeletonList rows={6} />}>
                <Await resolve={entities} errorElement={failed}>
                  {(data) => <HaEntityBrowser entities={data?.entities ?? []} storageKey="ha-entities-page" />}
                </Await>
              </React.Suspense>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1">
                  <CardTitle>{t("alarm.log.title")}</CardTitle>
                  <CardDescription>{t("alarm.log.description")}</CardDescription>
                </div>
              </CardHeader>
              <React.Suspense fallback={<SkeletonList rows={3} />}>
                <Await resolve={alarm} errorElement={failed}>
                  {(overview) => (
                    <div className="flex flex-col gap-4">
                      {overview && overview.panels.length > 1 && <AlarmPanelSelect overview={overview} />}
                      <AlarmLogList entries={overview?.log ?? []} />
                    </div>
                  )}
                </Await>
              </React.Suspense>
            </Card>
          )}
        </>
      )}
    </PageContainer>
  );
}

/** Which alarm panel the card shows, when Home Assistant has more than one. */
function AlarmPanelSelect({ overview }: { overview: AlarmOverview }) {
  const { t } = useTranslation("home-assistant");
  const fetcher = useFetcher<HomeAssistantActionResult>({ key: "ha-alarm-panel" });
  const pending = (fetcher.json as { settings?: { alarmEntityId?: string } } | undefined)?.settings?.alarmEntityId;
  return (
    <div className="flex flex-col gap-1.5 sm:max-w-sm">
      <Label htmlFor="ha-alarm-panel">{t("alarm.panel")}</Label>
      <Select
        value={pending ?? overview.panel?.entityId}
        onValueChange={(alarmEntityId) => void fetcher.submit({ intent: "save-settings", settings: { alarmEntityId } }, { method: "post", encType: "application/json" })}
      >
        <SelectTrigger id="ha-alarm-panel" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {overview.panels.map((panel) => (
            <SelectItem key={panel.entityId} value={panel.entityId}>
              {panel.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
