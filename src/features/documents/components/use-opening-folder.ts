import { useNavigation } from "react-router";
import { folderHref } from "./document-item";

/** True while the app is navigating into this folder, so its tile or row can show a spinner. `null`: never. */
export function useOpeningFolder(folderId: string | null): boolean {
  const navigation = useNavigation();
  return Boolean(folderId) && navigation.state === "loading" && navigation.location?.pathname === folderHref(folderId);
}
