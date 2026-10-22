import * as React from "react";
import { CpuIcon, MapIcon, MapPinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import type { LiveEventsStatus } from "@/lib/live-events";
import { FloorPlanView, type FloorPlan } from "@/features/places";
import { useDeviceMarkers, useDeviceStates } from "../components/device-indicator";
import { DeviceLegend } from "../components/device-legend";
import { DeviceSidePanel } from "../components/device-side-panel";
import { DeviceStateChip } from "../components/device-state-chip";
import { LiveStatusBadge } from "../components/live-status-badge";
import { RoomTemperatures } from "../components/room-temperatures";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "@/lib/hooks/use-now";
import type { Device, DeviceProfile } from "../types/devices";

type HouseScreenProps = {
  /** Every floor's plan, indoor floors first, the outdoor plan last. */
  plans: FloorPlan[];
  devices: Device[];
  profiles: DeviceProfile[];
  /** Adults and owners set manual values from the side panel. */
  canSetValues: boolean;
  /** Live updates over Server-Sent Events (off in Storybook). */
  live?: boolean;
  /** Fixed clock for stories and tests. */
  now?: number;
  /** Preselect a device (stories). */
  initialDeviceId?: string;
  /** Show this connection state without connecting (stories). */
  liveStatus?: LiveEventsStatus;
  /** On top of the side panel, composed by the route (the Home Assistant alarm card). */
  asideTop?: React.ReactNode;
};

/** The live house: floor tabs, the plan with an indicator per device, a legend and the clicked device. */
export function HouseScreen({ plans, devices: loaded, profiles, canSetValues, live = true, now: fixedNow, initialDeviceId, liveStatus, asideTop }: HouseScreenProps) {
  const { t } = useTranslation("devices");
  const now = useNow(30_000, fixedNow);
  const devices = useLiveDevices(loaded, { enabled: live && !liveStatus });
  // Live events and value changes reload the data in the background: say so in the badge, don't fade the plan.
  const refreshing = useRevalidator().state !== "idle";
  const stateOf = useDeviceStates(profiles, now);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = React.useState<string | null>(initialDeviceId ?? null);

  const requested = searchParams.get("floor");
  const plan = plans.find((candidate) => candidate.floor.id === requested) ?? plans[0];
  const floorId = plan?.floor.id ?? null;
  const markers = useDeviceMarkers(devices, profiles, floorId, now);

  const profilesById = React.useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const onFloor = devices.filter((device) => device.floorId === floorId && device.position);
  const unplaced = devices.filter((device) => !device.position);
  const legendProfiles = profiles.filter((profile) => onFloor.some((device) => device.profileId === profile.id));
  const selected = devices.find((device) => device.id === selectedId);
  const selectedProfile = selected ? profilesById.get(selected.profileId) : undefined;

  const selectFloor = (id: string) => {
    setSelectedId(null);
    setSearchParams((params) => {
      params.set("floor", id);
      return params;
    }, { replace: true });
  };

  if (plans.length === 0) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        {asideTop}
        <EmptyState
          icon={MapIcon}
          title={t("house.noFloors.title")}
          description={t("house.noFloors.description")}
          action={
            <Button asChild>
              <Link to="/places">{t("house.noFloors.action")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 px-4 py-4 sm:px-6 lg:min-h-dvh lg:px-8 lg:py-6">
      <PageHeader title={t("house.title")} description={t("house.description")} actions={(live || liveStatus) && <LiveStatusBadge status={liveStatus} refreshing={refreshing} />} />

      <Tabs value={floorId ?? undefined} onValueChange={selectFloor}>
        <TabsList aria-label={t("house.floors")}>
          {plans.map((candidate) => {
            const count = devices.filter((device) => device.floorId === candidate.floor.id && device.position).length;
            return (
              <TabsTrigger key={candidate.floor.id} value={candidate.floor.id}>
                {candidate.floor.name}
                {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {plan && (
          <FloorPlanView
            plan={plan}
            markers={markers}
            selectedMarkerId={selectedId}
            onMarkerClick={(id) => setSelectedId((current) => (current === id ? null : id))}
            legend={legendProfiles.length > 0 ? <DeviceLegend profiles={legendProfiles} /> : undefined}
            className="min-h-[28rem] lg:h-full"
          />
        )}

        <aside className="flex flex-col gap-4" aria-label={t("house.panel")}>
          {asideTop}
          {selected && selectedProfile ? (
            <DeviceSidePanel
              device={selected}
              profile={selectedProfile}
              state={stateOf(selected)}
              canSetValues={canSetValues}
              now={now}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Card className="gap-3">
              <h2 className="font-semibold">{t("house.onThisFloor")}</h2>
              {onFloor.length === 0 ? (
                <EmptyState
                  icon={CpuIcon}
                  title={t("house.noDevicesHere.title")}
                  description={t("house.noDevicesHere.description")}
                  action={
                    plan && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/places/floors/${plan.floor.id}/plan`}>{t("placement.placeOnPlan")}</Link>
                      </Button>
                    )
                  }
                  className="border-0 p-0"
                />
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {onFloor.map((device) => {
                    const state = stateOf(device);
                    return (
                      <li key={device.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(device.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                          <span className="truncate font-medium">{device.name}</span>
                          {state && <DeviceStateChip state={state} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          <RoomTemperatures devices={devices} profiles={profiles} stateOf={stateOf} floorId={floorId} />

          {unplaced.length > 0 && (
            <Card className="gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <MapPinOffIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("house.unplaced", { count: unplaced.length })}
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {unplaced.map((device) => {
                  const state = stateOf(device);
                  return (
                    <li key={device.id} className="flex items-center justify-between gap-2">
                      <Link to={`/devices/${device.id}`} className="truncate hover:underline">
                        {device.name}
                      </Link>
                      {state && <DeviceStateChip state={state} showValue={false} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
