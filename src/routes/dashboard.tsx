import { Suspense } from "react";
import { Await, useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DashboardScreen, dashboardLoader } from "@/features/dashboard";
import { HouseStatusCard, HouseStatusCardSkeleton, fetchHouseStatus } from "@/features/devices";
import { AlarmCard, canManageHomeAssistant, fetchAlarmOverview } from "@/features/home-assistant";

/**
 * Every card's request starts here without being awaited; the house status (Devices) fills the fourth stat,
 * with the alarm (Home Assistant) under it when Home Assistant has one.
 */
export function loader() {
  return { ...dashboardLoader(), houseStatus: fetchHouseStatus(), alarm: fetchAlarmOverview() };
}

export function Component() {
  const user = useCurrentUser();
  const data = useLoaderData<typeof loader>();
  return (
    <DashboardScreen
      data={data}
      userName={user.name}
      homeStatus={
        <div className="flex flex-col gap-3 sm:gap-4">
          <Suspense fallback={<HouseStatusCardSkeleton />}>
            <Await resolve={data.houseStatus}>{(status) => <HouseStatusCard status={status} />}</Await>
          </Suspense>
          {/* No skeleton: the alarm card only appears when there is an alarm, so it must not reserve space. */}
          <Suspense fallback={null}>
            <Await resolve={data.alarm} errorElement={null}>
              {(overview) => <AlarmCard overview={overview} canControl={canManageHomeAssistant(user.role)} compact />}
            </Await>
          </Suspense>
        </div>
      }
    />
  );
}
