import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DeviceProfilesScreen, canManageDevices, deviceProfilesAction, deviceProfilesLoader } from "@/features/devices";

export const loader = deviceProfilesLoader;
export const action = deviceProfilesAction;

export function Component() {
  const user = useCurrentUser();
  const { profiles, presets } = useLoaderData<typeof deviceProfilesLoader>();
  return <DeviceProfilesScreen profiles={profiles} presets={presets} canManage={canManageDevices(user.role)} />;
}
