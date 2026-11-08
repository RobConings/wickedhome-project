import * as React from "react";
import { MapIcon, MapPinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { MapInspector } from "@/components/shared/map-inspector";
import { RecordLink } from "@/components/shared/record-link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import type { LiveEventsStatus } from "@/lib/live-events";
import { FloorPlanView, type FloorPlan, type PlanMarker } from "@/features/places";
import { useDeviceMarkers, useDeviceStates } from "../components/device-indicator";
import { DeviceLegend } from "../components/device-legend";
import { DeviceSidePanel } from "../components/device-side-panel";
import { LiveStatusBadge } from "../components/live-status-badge";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
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
  renderRoomPanel?: (roomId: string) => React.ReactNode;
  roomMarkers?: Record<string, PlanMarker[]>;
};

/** The live house: floor tabs, the plan with an indicator per device, a legend and the clicked device. */
export function HouseScreen({ plans, devices: loaded, profiles, canSetValues, live = true, now: fixedNow, initialDeviceId, liveStatus, asideTop, renderRoomPanel, roomMarkers }: HouseScreenProps) {
  const { t } = useTranslation("devices");
  const now = useNow(30_000, fixedNow);
  const devices = useLiveDevices(loaded, { enabled: live && !liveStatus });
  // Live events and value changes reload the data in the background: say so in the badge, don't fade the plan.
  const refreshing = useRevalidator().state !== "idle";
  const stateOf = useDeviceStates(profiles, now);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUnplaced, setShowUnplaced] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialDeviceId ?? searchParams.get("device") ?? null);

  const requested = searchParams.get("floor");
  const plan = plans.find((candidate) => candidate.floor.id === requested) ?? plans[0];
  const floorId = plan?.floor.id ?? null;
  const markers = useDeviceMarkers(devices, profiles, floorId, now);

  const profilesById = React.useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const unplaced = devices.filter((device) => !device.position);
  const legendProfiles = profiles.filter((profile) => devices.some((device) => device.floorId === floorId && device.position && device.profileId === profile.id));
  const selected = devices.find((device) => device.id === (searchParams.get("device") ?? selectedId));
  const selectedProfile = selected ? profilesById.get(selected.profileId) : undefined;

  const selectFloor = (id: string) => {
    setSelectedId(null);
    setSearchParams((params) => {
      params.set("floor", id);
      params.delete("room"); params.delete("device");
      return params;
    }, { replace: true });
  };

  const closeInspector = React.useCallback(() => {
    setShowUnplaced(false);
    setSelectedId(null);
    setSearchParams((params) => { params.delete("device"); params.delete("room"); return params; }, { replace: true, preventScrollReset: true });
  }, [setSearchParams]);

  if (!plan) {
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

  const selectedRoom = plan.places.find((room) => room.id === searchParams.get("room"));
  const selectRoom = (id: string) => {
    setSelectedId(null);
    setSearchParams((params) => { params.delete("device"); params.set("room", id); return params; }, { preventScrollReset: true });
  };
  const selectedOnFloor = selected && (selected.floorId === floorId || selected.place?.floorId === floorId || !selected.floorId) ? selected : undefined;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-var(--mobile-nav-height,0px)-env(safe-area-inset-bottom))] min-h-[32rem] flex-col gap-3 p-3 sm:p-4 lg:h-dvh">
      <PageHeader title={t("house.title")} actions={<>
        {(live || liveStatus) && <LiveStatusBadge status={liveStatus} refreshing={refreshing} />}
        {canSetValues && <Button asChild variant="outline"><Link to={`/places/floors/${plan.floor.id}/plan`}>{t("placement.placeOnPlan")}</Link></Button>}
      </>} />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <SegmentedControl label={t("house.floors")} value={plan.floor.id} onChange={selectFloor} options={plans.map((item) => ({ value: item.floor.id, label: item.floor.name, icon: MapIcon }))} />
        {unplaced.length > 0 && <Button variant="ghost" onClick={() => setShowUnplaced((value) => !value)}><MapPinOffIcon />{t("house.unplaced", { count: unplaced.length })}</Button>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border bg-muted/30">
        <FloorPlanView plan={plan} markers={[...markers, ...(roomMarkers?.[plan.floor.id] ?? [])]} selectedMarkerId={selectedOnFloor?.id} selectedPlaceId={selectedRoom?.id}
          onPlaceClick={selectRoom} onMarkerClick={(id) => {
            if (id.startsWith("room:")) { selectRoom(id.slice(5)); return; }
            setSelectedId(id);
            setSearchParams((params) => { params.delete("room"); params.set("device", id); return params; }, { preventScrollReset: true });
          }} className="h-full min-h-0 rounded-none border-0" legend={legendProfiles.length > 0 ? <DeviceLegend profiles={legendProfiles} /> : undefined} />
        <MapInspector title={selectedOnFloor?.name ?? selectedRoom?.name ?? t("house.unplaced", { count: unplaced.length })} open={Boolean(selectedOnFloor || selectedRoom || showUnplaced)} onClose={closeInspector}>
          {selectedOnFloor && selectedProfile ? <DeviceSidePanel device={selectedOnFloor} profile={selectedProfile} state={stateOf(selectedOnFloor)} canSetValues={canSetValues} now={now} hideHeading className="border-0 bg-transparent p-0 shadow-none" />
            : selectedRoom ? <>{renderRoomPanel?.(selectedRoom.id)}<Button asChild><RecordLink to={`/places/${encodeURIComponent(selectedRoom.id)}`}>{t("house.openRoom")}</RecordLink></Button></>
            : <div className="flex flex-col gap-2">{unplaced.map((device) => <Button key={device.id} variant="outline" onClick={() => { setShowUnplaced(false); setSelectedId(device.id); }}>{device.name}</Button>)}</div>}
        </MapInspector>
        {asideTop && <div className="absolute bottom-3 left-3 z-10 max-w-[min(22rem,calc(100%-1.5rem))]">{asideTop}</div>}
      </div>
    </div>
  );
}
