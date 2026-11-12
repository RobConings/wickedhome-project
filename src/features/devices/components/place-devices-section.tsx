import { Inline } from "@/components/layout/inline";
import { CpuIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { GeneralList } from "@/components/shared/general-list";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordImage } from "@/components/shared/record-image";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchDevicesOverview } from "../data/devices-requests";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
import type { DevicesOverview } from "../types/devices";
import { DeviceTile } from "./device-tile";
import { DeviceIcon } from "./device-icon";
import { useDeviceStates } from "./device-indicator";
import { DeviceStateChip } from "./device-state-chip";
const EMPTY: DevicesOverview = { devices: [], profiles: [] };

export function PlaceDevicesSection({ placeId, initial, live = true, now: fixedNow }: { placeId: string; initial?: DevicesOverview; live?: boolean; now?: number }) {
  const { t } = useTranslation("devices");
  const resource = useAsyncResource(`room-devices:${placeId}`, fetchDevicesOverview, { initial });
  const overview = resource.data ?? EMPTY;
  const devices = useLiveDevices(overview.devices, { enabled: live && initial === undefined });
  const stateOf = useDeviceStates(overview.profiles, useNow(30_000, fixedNow));
  return <GeneralList search={{ keys: ["name"] }} label={t("page.title")} items={devices.filter((device) => device.place?.id === placeId)} getKey={(device) => device.id}
    loading={resource.loading} error={resource.error} onRetry={resource.refresh} storageKey="room-devices"
    renderRow={(device) => { const profile = overview.profiles.find((row) => row.id === device.profileId); const state = stateOf(device); return <Inline gap="md" align="center">
      <RecordImage src={device.imageUrl} shape="avatar" fallback={<DeviceIcon icon={profile?.icon} className="size-5" />} />
      <Link to={`/devices/${encodeURIComponent(device.id)}`} className="min-w-0 flex-1 py-2 font-medium hover:underline">{device.name}</Link>{state && <DeviceStateChip state={state} />}
    </Inline>; }}
    renderTile={(device) => <DeviceTile device={device} profile={overview.profiles.find((row) => row.id === device.profileId)} state={stateOf(device)} />}
    emptyState={<EmptyState icon={CpuIcon} title={t("room.empty")} />} />;
}
