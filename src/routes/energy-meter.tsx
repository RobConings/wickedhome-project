import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { EnergyMeterScreen, energyMeterLoader, energyImportAction, canManageEnergy } from "@/features/energy";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { formatTime } from "@/types/date-format";
import { todayIn } from "@/types/dates";
export const loader = energyMeterLoader;
export const action = energyImportAction;
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <EnergyMeterScreen key={data.detail.meter.id} {...data} now={{ date: todayIn(), time: formatTime(new Date()) }} canManage={canManageEnergy(user.role)} attachments={<DocumentAttachments entityType="energy_meter" entityId={data.detail.meter.id} canManage={canManageDocuments(user.role)} />} />;
}
