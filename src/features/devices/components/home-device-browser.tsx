import type * as React from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { Card } from "@/components/shared/card";
import { RecordLink } from "@/components/shared/record-link";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
import { useDeviceStates } from "./device-indicator";
import { DeviceIcon } from "./device-icon";
import { DeviceStateChip } from "./device-state-chip";
import { DeviceSidePanel } from "./device-side-panel";
import type { Device, DeviceProfile } from "../types/devices";

/** Uses the exact panel rendered by the map. Unplaced devices remain fully usable here. */
export function HomeDeviceBrowser({ devices: loaded, profiles, canSetValues, renderControls, live = true }: { devices: Device[]; profiles: DeviceProfile[]; canSetValues: boolean; renderControls: (device: Device) => React.ReactNode; live?: boolean }) {
  const { t } = useTranslation("devices"), [params, setParams] = useSearchParams();
  const devices = useLiveDevices(loaded, { enabled: live }), now = useNow(30_000), stateOf = useDeviceStates(profiles, now);
  const query = params.get("q") ?? "", room = params.get("place") ?? "all";
  const selected = devices.find((device) => device.id === params.get("device"));
  const profile = profiles.find((item) => item.id === selected?.profileId);
  const select = (id: string | null) => setParams((next) => { if (id) next.set("device", id); else next.delete("device"); return next; }, { preventScrollReset: true });
  const visible = devices.filter((device) => (room === "all" || device.place?.id === room) && `${device.name} ${device.place?.name ?? ""} ${profiles.find((item) => item.id === device.profileId)?.name ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Stack>
    <Input aria-label={t("page.title")} placeholder={t("page.title")} value={query} onChange={(event) => setParams((next) => { if (event.target.value) next.set("q", event.target.value); else next.delete("q"); return next; }, { replace: true, preventScrollReset: true })} />
    {room !== "all" && <Button variant="outline" onClick={() => setParams((next) => { next.delete("place"); return next; })}>{t("filters.allCategories")}</Button>}
    <PageGrid columns="cards">{visible.map((device) => {
      const deviceProfile = profiles.find((item) => item.id === device.profileId), state = stateOf(device);
      return <Card key={device.id} className="gap-3"><Button variant="ghost" className="h-auto min-w-0 justify-start whitespace-normal text-left" onClick={() => select(device.id)}><DeviceIcon icon={deviceProfile?.icon} /><span className="min-w-0 break-words">{device.name}</span></Button><Text size="sm" tone="muted">{device.place?.name ?? t("noPlace")}</Text>{state && <DeviceStateChip state={state} />}<Button asChild variant="outline" size="sm"><RecordLink to={`/devices/${device.id}`}>{t("house.openDevice", { defaultValue: "Device details" })}</RecordLink></Button></Card>;
    })}</PageGrid>
    {!visible.length && <Text tone="muted">{t("empty.noDevices.title")}</Text>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) select(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>{selected && profile && <DeviceSidePanel device={selected} profile={profile} state={stateOf(selected)} canSetValues={canSetValues} now={now} hideHeading controls={renderControls(selected)} className="border-0 p-0 shadow-none" />}</DialogContent></Dialog>
  </Stack>;
}
