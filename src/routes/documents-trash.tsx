import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentsTrashScreen, canManageDocuments, documentsTrashAction, documentsTrashLoader } from "@/features/documents";

export const loader = documentsTrashLoader;
export const action = documentsTrashAction;

export function Component() {
  const user = useCurrentUser();
  const { trash, usage } = useLoaderData<typeof documentsTrashLoader>();
  return <DocumentsTrashScreen trash={trash} usage={usage} canManage={canManageDocuments(user.role)} />;
}
