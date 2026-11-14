import { Suspense } from "react";
import { Await, useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HouseScreen, canManageDevices, devicesAction, houseShouldRevalidate } from "@/features/devices";
import { fetchHomeMap, HomeRoomSummary, useHomeWorkMarkers } from "@/features/dashboard";
import { AlarmCard, HaDeviceActions, canManageHomeAssistant, fetchAlarmOverview } from "@/features/home-assistant";
import { HomeControlNavigation, HomeControlScreen, fetchHomeActions } from "@/features/home-actions";

/** The plans and devices, plus the alarm (Home Assistant), not awaited: it has its own skeleton. */
export async function loader() {
  const alarm = fetchAlarmOverview();
  const [mapData, homeActions] = await Promise.all([fetchHomeMap(), fetchHomeActions()]);
  return { plans: mapData.plans, devices: mapData.devices?.devices ?? [], profiles: mapData.devices?.profiles ?? [], mapData, alarm, homeActions };
}
export const action = devicesAction;
export const shouldRevalidate = houseShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  const { plans, devices, profiles, mapData, alarm, homeActions } = useLoaderData<typeof loader>();
  const roomMarkers = useHomeWorkMarkers(mapData);
  return (
    <HomeControlScreen initial={homeActions} devices={devices} profiles={profiles} canManage={canManageDevices(user.role)}
      rooms={plans.flatMap((plan) => plan.places.map((room) => ({ id: room.id, name: room.name, floorName: plan.floor.name })))}
      renderDeviceControls={(device) => <HaDeviceActions device={device} canControl={canManageHomeAssistant(user.role)} />}
      alarm={<Suspense fallback={null}><Await resolve={alarm} errorElement={null}>{(overview) => <AlarmCard overview={overview} canControl={canManageHomeAssistant(user.role)} compact />}</Await></Suspense>}
      map={<HouseScreen
      plans={plans}
      roomMarkers={roomMarkers}
      renderRoomPanel={(roomId) => <HomeRoomSummary data={mapData} roomId={roomId} />}
      navigation={<HomeControlNavigation />}
      renderDeviceControls={(device) => <HaDeviceActions device={device} canControl={canManageHomeAssistant(user.role)} />}
      devices={devices}
      profiles={profiles}
      canSetValues={canManageDevices(user.role)}
    />} />
  );
}
