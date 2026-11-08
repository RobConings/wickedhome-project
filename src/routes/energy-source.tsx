import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { EnergySourceScreen, energySourceLoader, energySourceAction, canManageEnergy } from "@/features/energy";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { todayIn } from "@/types/dates";
export const loader = energySourceLoader;
export const action = energySourceAction;
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  const id = data.solar?.id ?? data.battery!.id;
  return <EnergySourceScreen key={id} {...data} today={todayIn()} canManage={canManageEnergy(user.role)} attachments={<DocumentAttachments entityType={data.solar ? "solar_installation" : "home_battery"} entityId={id} canManage={canManageDocuments(user.role)} />} />;
}
