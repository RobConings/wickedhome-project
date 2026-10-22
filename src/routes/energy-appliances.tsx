import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { AppliancesScreen, appliancesAction, appliancesLoader, canManageEnergy } from "@/features/energy";
import { screenHandle } from "@/lib/screen-context";

export const loader = appliancesLoader;
export const action = appliancesAction;
export const handle = screenHandle(({ t }) => ({ kind: "energy", label: t("screen.appliances") }));

export function Component() {
  const user = useCurrentUser();
  const { appliances, places } = useLoaderData<typeof appliancesLoader>();
  return (
    <AppliancesScreen
      appliances={appliances}
      places={places}
      canManage={canManageEnergy(user.role)}
      documents={(appliance) => (
        <DocumentAttachments
          entityType="appliance"
          entityId={appliance.id}
          canManage={canManageDocuments(user.role)}
          // Inside the appliance's dialog: no second card around the list.
          className="border-0 p-0 shadow-none"
        />
      )}
    />
  );
}
