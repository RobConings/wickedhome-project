import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ApplianceDetailScreen, applianceDetailLoader, appliancesAction, canManageEnergy } from "@/features/energy";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { screenHandle } from "@/lib/screen-context";
export const loader = applianceDetailLoader;
export const action = appliancesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "energy", label: data.appliance.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <ApplianceDetailScreen key={data.appliance.id} {...data} canManage={canManageEnergy(user.role)} attachments={<DocumentAttachments entityType="appliance" entityId={data.appliance.id} canManage={canManageDocuments(user.role)} />} />;
}
