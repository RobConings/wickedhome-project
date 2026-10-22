import { useTranslation } from "react-i18next";
import type { DocumentFolder } from "../types/documents";

/** "3 folders · 12 files", "1 file", "Empty". */
export function useFolderSummary() {
  const { t } = useTranslation("documents");
  return (folder: Pick<DocumentFolder, "folderCount" | "fileCount">) => {
    const parts = [
      folder.folderCount > 0 && t("folder.folders", { count: folder.folderCount }),
      folder.fileCount > 0 && t("folder.files", { count: folder.fileCount }),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : t("folder.empty");
  };
}
