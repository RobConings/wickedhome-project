import { Suspense } from "react";
import { Await, useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HouseScreen, canManageDevices, devicesAction, houseShouldRevalidate } from "@/features/devices";
import { fetchHomeMap, HomeRoomSummary, useHomeWorkMarkers } from "@/features/dashboard";
import { AlarmCard, canManageHomeAssistant, fetchAlarmOverview } from "@/features/home-assistant";

/** The plans and devices, plus the alarm (Home Assistant), not awaited: it has its own skeleton. */
export async function loader() {
  const alarm = fetchAlarmOverview();
  const mapData = await fetchHomeMap();
  return { plans: mapData.plans, devices: mapData.devices?.devices ?? [], profiles: mapData.devices?.profiles ?? [], mapData, alarm };
}
export const action = devicesAction;
export const shouldRevalidate = houseShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  const { plans, devices, profiles, mapData, alarm } = useLoaderData<typeof loader>();
  const roomMarkers = useHomeWorkMarkers(mapData);
  return (
    <HouseScreen
      plans={plans}
      roomMarkers={roomMarkers}
      renderRoomPanel={(roomId) => <HomeRoomSummary data={mapData} roomId={roomId} />}
      devices={devices}
      profiles={profiles}
      canSetValues={canManageDevices(user.role)}
      // Route-level composition: devices offers the slot, Home Assistant fills it with the alarm.
      asideTop={
        // No skeleton: the card only appears when Home Assistant has an alarm, so it must not reserve space.
        <Suspense fallback={null}>
          <Await resolve={alarm} errorElement={null}>
            {(overview) => <AlarmCard overview={overview} canControl={canManageHomeAssistant(user.role)} compact />}
          </Await>
        </Suspense>
      }
    />
  );
}
