import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { canManageDocuments } from "@/features/documents";
import { DriveFolderScreen, driveFolderLoader } from "@/features/integrations";

export const loader = driveFolderLoader;

/** `/documents/drive/:linkId[?folder=]`: a Google Drive folder linked into Documents. */
export function Component() {
  const user = useCurrentUser();
  const { linkId, listing } = useLoaderData<typeof driveFolderLoader>();
  return <DriveFolderScreen key={linkId} linkId={linkId} listing={listing} canManage={canManageDocuments(user.role)} />;
}
