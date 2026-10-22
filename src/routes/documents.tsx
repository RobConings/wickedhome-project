import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentsScreen, canManageDocuments, documentsAction, documentsLoader } from "@/features/documents";
import { LinkedDriveFolders, SaveToDriveMenuItem } from "@/features/integrations";
import { screenHandle } from "@/lib/screen-context";

export const loader = documentsLoader;
export const action = documentsAction;
export const handle = screenHandle(({ t }) => ({ kind: "documents", label: t("nav.documents") }));

/** `/documents` (drive root) and `/documents/folders/:folderId`, optionally with `?q=`. */
export function Component() {
  const user = useCurrentUser();
  const canManage = canManageDocuments(user.role);
  return (
    <DocumentsScreen
      data={useLoaderData<typeof documentsLoader>()}
      canManage={canManage}
      // Google Drive (integrations): linked folders at the root, "Save to Drive" for local files.
      rootExtras={<LinkedDriveFolders />}
      fileMenuItems={canManage ? (file) => <SaveToDriveMenuItem file={file} /> : undefined}
    />
  );
}
