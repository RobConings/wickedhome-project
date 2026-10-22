import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { canManageDevices, fetchDevicesOverview, useDevicePlanLayer, type DevicesOverview } from "@/features/devices";
import { FloorPlanScreen, canManagePlaces, floorPlanAction, floorPlanLoader } from "@/features/places";
import { screenHandle } from "./lib/screen-context";

/**
 * The plan, plus the household's devices to show and place on it. Devices are optional and not awaited:
 * the plan shows at once, the device markers and palette follow (with a skeleton meanwhile).
 */
export async function loader(args: LoaderFunctionArgs) {
  const devices = fetchDevicesOverview().catch((): DevicesOverview => ({ devices: [], profiles: [] }));
  return { plan: await floorPlanLoader(args), devices };
}
export const action = floorPlanAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "floor", id: data.plan.floor.id, label: data.plan.floor.name }));

export function Component() {
  const user = useCurrentUser();
  const { plan, devices } = useLoaderData<typeof loader>();
  // Route-level composition: places draws generic markers, devices turns devices into markers and a palette.
  const deviceLayer = useDevicePlanLayer({ overview: devices, floorId: plan.floor.id, canManage: canManageDevices(user.role) });
  return <FloorPlanScreen plan={plan} canManage={canManagePlaces(user.role)} {...deviceLayer} />;
}
