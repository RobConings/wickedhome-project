import * as React from "react";
import { Link } from "react-router";
import { ChevronRightIcon, CloudUploadIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { googleClient, type GoogleClient } from "../data/google-client";
import type { DriveFolderLink } from "../types/google";

/** Whether the signed-in person turned Drive on, asked once a minute at most (menus open often). */
let driveCheck: { at: number; promise: Promise<boolean> } | null = null;
function driveEnabled(client: GoogleClient): Promise<boolean> {
  if (!driveCheck || Date.now() - driveCheck.at > 60_000) {
    driveCheck = {
      at: Date.now(),
      promise: client
        .status()
        .then((status) => status.connection?.status === "connected" && status.connection.features.includes("drive"))
        .catch(() => false),
    };
  }
  return driveCheck.promise;
}

/**
 * Linked Drive folders at the top of the documents root, each with a Drive badge, opening the folder
 * (read live from Drive). Loads itself; shows nothing when there are none.
 */
export function LinkedDriveFolders({ initial, client = googleClient }: { initial?: DriveFolderLink[]; client?: GoogleClient }) {
  const { t } = useTranslation("integrations");
  const [links, setLinks] = React.useState<DriveFolderLink[]>(initial ?? []);

  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    client
      .driveLinks()
      .then((list) => !cancelled && setLinks(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, initial]);

  if (links.length === 0) return null;
  return (
    <section aria-label={t("driveFolder.title")} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t("driveFolder.title")}</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              to={`/documents/drive/${encodeURIComponent(link.id)}`}
              aria-disabled={!link.available || undefined}
              className="flex min-h-14 items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/50 aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              <FolderIcon className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{link.name}</span>
                  <Badge variant="secondary">{t("driveFolder.badge")}</Badge>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {link.available ? t("driveFolder.linkedBy", { name: link.ownerName }) : t("driveFolder.unavailable", { name: link.ownerName })}
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Save to Drive" in a document's menu: copies it into your Drive (folder "WickedHome"). Only when Drive is on. */
export function SaveToDriveMenuItem({ file, client = googleClient }: { file: { id: string; storageProvider: "local" | "google_drive" }; client?: GoogleClient }) {
  const { t } = useTranslation("integrations");
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void driveEnabled(client).then((value) => !cancelled && setEnabled(value));
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!enabled || file.storageProvider !== "local") return null;
  return (
    <DropdownMenuItem
      onSelect={() => {
        const id = toast.loading(t("driveFolder.saveToDrive"));
        client
          .saveToDrive(file.id)
          .then(({ webUrl }) =>
            toast.success(t("driveFolder.savedToDrive"), {
              id,
              ...(webUrl && { action: { label: t("driveFolder.openInDrive"), onClick: () => window.open(webUrl, "_blank", "noopener") } }),
            }),
          )
          .catch(() => toast.error(t("driveFolder.saveFailed"), { id }));
      }}
    >
      <CloudUploadIcon />
      {t("driveFolder.saveToDrive")}
    </DropdownMenuItem>
  );
}
