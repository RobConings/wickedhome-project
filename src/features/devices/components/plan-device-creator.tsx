import { Text } from "@/components/ui/text";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchPlaces } from "@/features/places";
import { fetchAppliances } from "@/features/energy";
import { fetchDevicesOverview } from "../data/devices-requests";
import { DeviceFormDialog } from "./device-form-dialog";

/** Create here, then choose the actual point with the editor's existing tap/drag palette. */
export function PlanDeviceCreator({ placeId }: { placeId?: string }) {
  const { t } = useTranslation("devices");
  const { data, error, refresh } = useAsyncResource("plan-device-create", async () => {
    const [overview, places, appliances] = await Promise.all([fetchDevicesOverview(), fetchPlaces(), fetchAppliances()]);
    return { ...overview, places, appliances };
  });
  if (!data) return <Button variant="outline" disabled={!error} onClick={refresh}><PlusIcon />{t("add")}</Button>;
  if (!data.profiles.length) return <Text size="sm" tone="muted">{t("form.profilePlaceholder")}</Text>;
  return <DeviceFormDialog profiles={data.profiles} places={data.places} appliances={data.appliances} defaultPlaceId={placeId} trigger={<Button variant="outline"><PlusIcon />{t("add")}</Button>} />;
}
