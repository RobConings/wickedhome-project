import { CloudIcon, CloudUploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "../types/documents";

/**
 * Where a file's bytes are, when that's not simply the server: "Drive" for files stored in Google Drive, and
 * "Waiting for Drive" for files that should go to Drive but are kept on the server until it is available
 * again (a job retries). Renders nothing for ordinary local files.
 */
export function DocumentStorageBadge({ file, className }: { file: Pick<DocumentFile, "storageProvider" | "pendingStorageTarget">; className?: string }) {
  const { t } = useTranslation("documents");
  if (file.storageProvider === "google_drive") {
    return (
      <Badge variant="info" className={cn("px-1.5 py-0", className)} title={t("storage.inDriveHint")}>
        <CloudIcon aria-hidden="true" />
        {t("storage.inDrive")}
      </Badge>
    );
  }
  if (file.pendingStorageTarget) {
    return (
      <Badge variant="warning" className={cn("px-1.5 py-0", className)} title={t("storage.pendingHint")}>
        <CloudUploadIcon aria-hidden="true" />
        {t("storage.pending")}
      </Badge>
    );
  }
  return null;
}
