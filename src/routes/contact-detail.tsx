import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ContactDetailScreen, canManageContacts, contactDetailAction, contactDetailLoader } from "@/features/contacts";
import { screenHandle } from "@/lib/screen-context";

export const loader = contactDetailLoader;
export const action = contactDetailAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "contact", id: data.contact.id, label: data.contact.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <ContactDetailScreen key={data.contact.id} {...data} canManage={canManageContacts(user.role)} />;
}
