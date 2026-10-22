import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DevicesScreen, canManageDevices, devicesAction, devicesLoader } from "@/features/devices";
import { screenHandle } from "@/lib/screen-context";

export const loader = devicesLoader;
export const action = devicesAction;
export const handle = screenHandle(({ t }) => ({ kind: "devices", label: t("nav.devices") }));

export function Component() {
  const user = useCurrentUser();
  const { devices, profiles, places, appliances } = useLoaderData<typeof devicesLoader>();
  return <DevicesScreen devices={devices} profiles={profiles} places={places} appliances={appliances} canManage={canManageDevices(user.role)} />;
}
