import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DeviceDetailScreen, canManageDevices, deviceDetailLoader, devicesAction } from "@/features/devices";
import { HaEntityPickerDialog } from "@/features/home-assistant";
import { NotifyMeToggle } from "@/features/notifications";
import { screenHandle } from "@/lib/screen-context";

export const loader = deviceDetailLoader;
export const action = devicesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "device", id: data.device.id, label: data.device.name }));

export function Component() {
  const user = useCurrentUser();
  const { device, profile, profiles, places, appliances } = useLoaderData<typeof deviceDetailLoader>();
  return (
    <DeviceDetailScreen
      key={device.id}
      device={device}
      profile={profile}
      profiles={profiles}
      places={places}
      appliances={appliances}
      canManage={canManageDevices(user.role)}
      // Route-level composition: devices offers a slot, Home Assistant fills it with its entity browser.
      renderEntityPicker={(props) => <HaEntityPickerDialog {...props} />}
      // …and notifications its "Notify me" (when the device's indicator turns orange or red).
      headerActions={<NotifyMeToggle kind="devices.indicator" scopeId={`device:${device.id}`} name={device.name} />}
    />
  );
}
