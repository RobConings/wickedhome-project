import * as React from "react";
import { Link } from "react-router";
import { ChevronRightIcon, FolderIcon, FolderPlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SkeletonList } from "./loading-state";
import { googleClient, type GoogleClient } from "../data/google-client";
import type { DriveItem, GoogleDriveSettings } from "../types/google";

type Crumb = { id: string; name: string };

/** Using the picker for something else than linking (e.g. choosing where bill documents go). */
export type DriveFolderPick = {
  title: string;
  description: string;
  confirmLabel: (name: string) => string;
  /** The disabled button's text before a folder is opened. */
  openLabel: string;
  /** Rejecting keeps the dialog open (the caller shows the error). */
  onPick: (folder: Crumb) => Promise<void>;
};

/**
 * Browses the folders of your Drive to pick one to link into the household's Documents. Linking shares
 * that folder's contents (read-only) with the household through your connection. With `pick`, the chosen
 * folder goes to `pick.onPick` instead of being linked.
 */
export function DriveFolderPickerDialog({
  trigger,
  client = googleClient,
  onLinked,
  pick,
}: {
  trigger: React.ReactElement;
  client?: Pick<GoogleClient, "driveFolders" | "linkDriveFolder">;
  onLinked?: () => void;
  pick?: DriveFolderPick;
}) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [path, setPath] = React.useState<Crumb[]>([]);
  const [loaded, setLoaded] = React.useState<{ folder: string; items: DriveItem[] | "error" } | null>(null);
  const [linking, setLinking] = React.useState(false);
  const current = path.at(-1);
  const folder = current?.id ?? "root";
  // A skeleton until the open folder's own listing arrived.
  const items = loaded?.folder === folder ? loaded.items : null;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    client
      .driveFolders(folder)
      .then((list) => !cancelled && setLoaded({ folder, items: list }))
      .catch(() => !cancelled && setLoaded({ folder, items: "error" }));
    return () => {
      cancelled = true;
    };
  }, [open, folder, client]);

  const link = () => {
    if (!current) return;
    setLinking(true);
    if (pick) {
      pick
        .onPick(current)
        .then(() => {
          setOpen(false);
          setPath([]);
        })
        .catch(() => undefined)
        .finally(() => setLinking(false));
      return;
    }
    client
      .linkDriveFolder(current.id)
      .then(() => {
        toast.success(t("google.drive.linked", { name: current.name }));
        setOpen(false);
        setPath([]);
        onLinked?.();
      })
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setLinking(false));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !linking && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pick?.title ?? t("google.drive.pickTitle")}</DialogTitle>
          <DialogDescription>{pick?.description ?? t("google.drive.pickDescription")}</DialogDescription>
        </DialogHeader>
        <nav aria-label={t("google.drive.path")}>
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {[{ id: "root", name: t("google.drive.myDrive") }, ...path].map((crumb, index, all) => (
              <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />}
                {index === all.length - 1 ? (
                  <span className="truncate font-medium text-foreground" aria-current="location">
                    {crumb.name}
                  </span>
                ) : (
                  <button type="button" className="min-h-8 truncate rounded px-1 hover:bg-accent" onClick={() => setPath(path.slice(0, index))}>
                    {crumb.name}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {items === null ? (
          <SkeletonList rows={4} />
        ) : items === "error" ? (
          <ErrorState title={t("google.drive.loadError")} className="py-6" />
        ) : items.length === 0 ? (
          <EmptyState icon={FolderIcon} title={t("google.drive.noSubfolders")} className="py-6" />
        ) : (
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50"
                  onClick={() => setPath([...path, { id: item.id, name: item.name }])}
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={link} disabled={!current} loading={linking}>
            {current
              ? (pick?.confirmLabel(current.name) ?? t("google.drive.linkThis", { name: current.name }))
              : (pick?.openLabel ?? t("google.drive.openAFolder"))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Drive on the Google card: how many folders you linked, where they show, and linking another one. */
export function GoogleDrivePanel({ settings, client = googleClient }: { settings: GoogleDriveSettings; client?: GoogleClient }) {
  const { t } = useTranslation("integrations");
  const [count, setCount] = React.useState(settings.linkCount);
  return (
    <div className="flex flex-col gap-3 pl-0 sm:pl-6">
      <p className="text-sm text-muted-foreground">
        {count > 0 ? (
          <>
            {t("google.drive.linkCount", { count })}{" "}
            <Link to="/documents" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("google.drive.openDocuments")}
            </Link>
          </>
        ) : (
          t("google.drive.noLinks")
        )}
      </p>
      <DriveFolderPickerDialog
        client={client}
        onLinked={() => setCount((value) => value + 1)}
        trigger={
          <Button size="sm" variant="outline" className="w-fit">
            <FolderPlusIcon />
            {t("google.drive.link")}
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground">{t("google.drive.privacy")}</p>
    </div>
  );
}
