import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DeviceProfileEditorScreen, canManageDevices, deviceProfileAction, deviceProfileLoader } from "@/features/devices";

export const loader = deviceProfileLoader;
export const action = deviceProfileAction;

export function Component() {
  const user = useCurrentUser();
  const { profile } = useLoaderData<typeof deviceProfileLoader>();
  // Keyed: after creating, the redirect to the new id starts a fresh editor with the saved profile.
  return <DeviceProfileEditorScreen key={profile?.id ?? "new"} profile={profile} canManage={canManageDevices(user.role)} />;
}
