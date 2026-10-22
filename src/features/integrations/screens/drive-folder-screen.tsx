import * as React from "react";
import { DownloadIcon, ExternalLinkIcon, EyeIcon, FileInputIcon, FolderIcon, LinkIcon, MoreVerticalIcon, UnlinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/layout/page-container";
import { BreadcrumbTrail } from "@/components/shared/breadcrumb-trail";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { GeneralList } from "@/components/shared/general-list";
import { SkeletonList } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatBytes } from "@/lib/format-bytes";
import { currentLocale } from "@/lib/i18n";
import { useSamePagePending } from "@/lib/pending";
import { formatDate } from "@/types/date-format";
import { DocumentPreviewDialog } from "@/features/documents";
import { DRIVE_FOLDER_PARAM } from "../data/drive-loaders";
import { googleClient, type GoogleClient } from "../data/google-client";
import { driveFileUrl } from "../data/google-requests";
import type { DriveFolderListing, DriveItem } from "../types/google";
import { BackButton } from "@/components/shared/link-buttons";

type DriveFolderScreenProps = {
  linkId: string;
  /** Deferred listing from the loader (skeleton meanwhile); `null` = couldn't be read. */
  listing: DriveFolderListing | null | Promise<DriveFolderListing | null>;
  /** Owners and adults import files and unlink their own folders. */
  canManage: boolean;
  client?: GoogleClient;
};

const folderHref = (linkId: string, folderId?: string) =>
  `/documents/drive/${encodeURIComponent(linkId)}${folderId ? `?${DRIVE_FOLDER_PARAM}=${encodeURIComponent(folderId)}` : ""}`;

function Deferred(props: Omit<DriveFolderScreenProps, "listing"> & { promise: Promise<DriveFolderListing | null> }) {
  return <DriveFolderContent {...props} listing={React.use(props.promise)} />;
}

/**
 * A Drive folder linked into Documents: browse it (read live from Drive), open or download files through
 * the server, import a copy into Documents or add it as a link that stays in Drive. Read-only towards Drive.
 */
export function DriveFolderScreen({ listing, ...props }: DriveFolderScreenProps) {
  if (listing instanceof Promise) {
    return (
      <React.Suspense fallback={<DriveFolderSkeleton />}>
        <Deferred {...props} promise={listing} />
      </React.Suspense>
    );
  }
  return <DriveFolderContent {...props} listing={listing} />;
}

function BackLink() {
  const { t } = useTranslation("integrations");
  return (
    <BackButton to="/documents" className="w-fit">{t("driveFolder.back")}</BackButton>
  );
}

function DriveFolderSkeleton() {
  const { t } = useTranslation("integrations");
  return (
    <PageContainer aria-busy="true" aria-label={t("driveFolder.title")}>
      <BackLink />
      <SkeletonList rows={6} />
    </PageContainer>
  );
}

function DriveFolderContent({ linkId, listing, canManage, client = googleClient }: Omit<DriveFolderScreenProps, "listing"> & { listing: DriveFolderListing | null }) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const navigate = useNavigate();
  const pending = useSamePagePending();
  const locale = currentLocale();
  const [importing, setImporting] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState<DriveItem | null>(null);

  if (!listing) {
    return (
      <PageContainer>
        <BackLink />
        <ErrorState
          title={t("driveFolder.loadError")}
          action={
            <Button variant="outline" onClick={() => navigate(0)}>
              {tCommon("actions.retry")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const { link } = listing;
  const crumbs = [
    { label: link.name, to: listing.breadcrumbs.length ? folderHref(linkId) : undefined },
    ...listing.breadcrumbs.map((crumb, index) => ({
      label: crumb.name,
      to: index < listing.breadcrumbs.length - 1 ? folderHref(linkId, crumb.id) : undefined,
    })),
  ];

  const importFile = (item: DriveItem, keep: "copy" | "drive") => {
    setImporting(item.id);
    client
      .importDriveFile(linkId, { fileId: item.id, keep })
      .then(() => toast.success(t("driveFolder.imported", { name: item.name })))
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setImporting(null));
  };

  // Files open in the in-app preview, like documents: a new tab from the installed phone app lands in the
  // browser, which doesn't share the app's login, so the file wouldn't load there.
  const openItem = (item: DriveItem) => {
    if (item.isFolder) return navigate(folderHref(linkId, item.id));
    if (item.downloadable) return setPreviewing(item);
    if (item.webUrl) window.open(item.webUrl, "_blank", "noopener");
  };

  const details = (item: DriveItem) =>
    [item.sizeBytes !== null ? formatBytes(item.sizeBytes, locale) : null, item.modifiedAt ? formatDate(item.modifiedAt, locale) : null]
      .filter(Boolean)
      .join(" · ");

  const menu = (item: DriveItem) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative z-[1] shrink-0" aria-label={item.name} loading={importing === item.id}>
          <MoreVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {item.downloadable ? (
          <>
            <DropdownMenuItem onSelect={() => openItem(item)}>
              <EyeIcon />
              {t("driveFolder.open")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={driveFileUrl(linkId, item.id, { download: true })}>
                <DownloadIcon />
                {t("driveFolder.download")}
              </a>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem disabled>{t("driveFolder.notDownloadable")}</DropdownMenuItem>
        )}
        {item.webUrl && (
          <DropdownMenuItem asChild>
            <a href={item.webUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon />
              {t("driveFolder.openInDrive")}
            </a>
          </DropdownMenuItem>
        )}
        {canManage && item.downloadable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => importFile(item, "copy")}>
              <FileInputIcon />
              {t("driveFolder.importCopy")}
            </DropdownMenuItem>
            {item.linkable && (
              <DropdownMenuItem onSelect={() => importFile(item, "drive")}>
                <LinkIcon />
                {t("driveFolder.addAsLink")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const icon = (item: DriveItem, variant: "icon" | "tile") =>
    item.isFolder ? (
      <FolderIcon className={variant === "icon" ? "size-5 text-primary" : "size-10 text-primary"} aria-hidden="true" />
    ) : (
      <FileTypeIcon mimeType={item.mimeType} name={item.name} variant={variant === "icon" ? "icon" : "tile"} />
    );

  return (
    <PageContainer>
      <BackLink />
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">{t("driveFolder.badge")}</Badge>
            {t("driveFolder.linkedBy", { name: link.ownerName })}
          </span>
        }
        title={listing.breadcrumbs.at(-1)?.name ?? link.name}
        actions={
          link.mine &&
          canManage && (
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <UnlinkIcon />
                  {t("driveFolder.unlink")}
                </Button>
              }
              title={t("driveFolder.unlinkConfirm", { name: link.name })}
              confirmLabel={t("driveFolder.unlink")}
              onConfirm={() =>
                client
                  .unlinkDriveFolder(link.id)
                  .then(() => {
                    toast.success(t("driveFolder.unlinked"));
                    navigate("/documents");
                  })
                  .catch(() => toast.error(tCommon("errors.generic")))
              }
            />
          )
        }
      />
      {crumbs.length > 1 && <BreadcrumbTrail items={crumbs} label={t("google.drive.path")} />}
      <GeneralList
        label={link.name}
        items={listing.items}
        getKey={(item) => item.id}
        search={{ keys: ["name"] }}
        storageKey="drive-folder"
        defaultView="list"
        pending={pending}
        emptyState={<EmptyState icon={FolderIcon} title={t("driveFolder.empty")} />}
        renderRow={(item) => (
          <div className="relative flex min-h-11 items-center gap-3">
            {icon(item, "icon")}
            <button type="button" className="flex min-w-0 flex-1 flex-col text-left after:absolute after:inset-0" onClick={() => openItem(item)}>
              <span className="truncate text-sm font-medium">{item.name}</span>
              {details(item) && <span className="text-xs text-muted-foreground">{details(item)}</span>}
            </button>
            {!item.isFolder && menu(item)}
          </div>
        )}
        renderTile={(item) => (
          <Card className="relative h-full gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              {icon(item, "tile")}
              {!item.isFolder && menu(item)}
            </div>
            <button type="button" className="min-w-0 text-left after:absolute after:inset-0" onClick={() => openItem(item)}>
              <span className="line-clamp-2 text-sm font-medium break-words">{item.name}</span>
            </button>
            {details(item) && <span className="text-xs text-muted-foreground">{details(item)}</span>}
          </Card>
        )}
      />
      <DocumentPreviewDialog
        file={previewing}
        onOpenChange={(open) => !open && setPreviewing(null)}
        src={previewing ? driveFileUrl(linkId, previewing.id) : undefined}
        downloadSrc={previewing ? driveFileUrl(linkId, previewing.id, { download: true }) : undefined}
      />
    </PageContainer>
  );
}
