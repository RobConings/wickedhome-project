import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ContactsScreen, canManageContacts, contactsAction, contactsLoader } from "@/features/contacts";
import { screenHandle } from "@/lib/screen-context";

export const loader = contactsLoader;
export const action = contactsAction;
export const handle = screenHandle(({ t }) => ({ kind: "contacts", label: t("nav.contacts") }));

export function Component() {
  const user = useCurrentUser();
  const { contacts, shops } = useLoaderData<typeof contactsLoader>();
  return <ContactsScreen contacts={contacts} shops={shops} canManage={canManageContacts(user.role)} />;
}
