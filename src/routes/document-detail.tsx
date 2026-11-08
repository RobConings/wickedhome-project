import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentDetailScreen, documentDetailAction, documentDetailLoader, canManageDocuments } from "@/features/documents";
import { screenHandle } from "@/lib/screen-context";
import { SaveToDriveMenuItem } from "@/features/integrations";
export const loader = documentDetailLoader;
export const action = documentDetailAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "document", id: data.detail.file.id, label: data.detail.file.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  const canManage = canManageDocuments(user.role);
  return <DocumentDetailScreen key={data.detail.file.id} {...data} canManage={canManage} fileMenuItems={canManage ? (file) => <SaveToDriveMenuItem file={file} /> : undefined} />;
}
