import { Suspense } from "react";
import { Await, useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HouseScreen, canManageDevices, devicesAction, houseLoader, houseShouldRevalidate } from "@/features/devices";
import { AlarmCard, canManageHomeAssistant, fetchAlarmOverview } from "@/features/home-assistant";

/** The plans and devices, plus the alarm (Home Assistant), not awaited: it has its own skeleton. */
export async function loader() {
  const alarm = fetchAlarmOverview();
  return { ...(await houseLoader()), alarm };
}
export const action = devicesAction;
export const shouldRevalidate = houseShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  const { plans, devices, profiles, alarm } = useLoaderData<typeof loader>();
  return (
    <HouseScreen
      plans={plans}
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
