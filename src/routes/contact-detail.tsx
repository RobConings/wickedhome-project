import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ContactDetailScreen, ContactProjectsPanel, canManageContacts, contactDetailAction, contactDetailLoader } from "@/features/contacts";
import { ProjectPicker } from "@/features/projects";
import { useTranslation } from "react-i18next";
import { screenHandle } from "@/lib/screen-context";

export const loader = contactDetailLoader;
export const action = contactDetailAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "contact", id: data.contact.id, label: data.contact.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  const { t } = useTranslation("contacts");
  const canManage = canManageContacts(user.role);
  return <ContactDetailScreen key={data.contact.id} {...data} canManage={canManage} projects={<ContactProjectsPanel contact={data.contact} canManage={canManage} projectField={{ name: "projectId", type: "custom", label: t("project.chooseProject"), render: ({ id, name, value, setValue, invalid, disabled }) => <ProjectPicker id={id} name={name} value={typeof value === "string" ? value : null} onChange={setValue} invalid={invalid} disabled={disabled} /> }} />} />;
}
