import * as React from "react";
import { DownloadIcon, EyeIcon, FolderOpenIcon, MoreVerticalIcon, PaperclipIcon, UnlinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardHeader, CardTitle } from "./card";
import { FileDropZone } from "./file-drop-zone";
import { FileTypeIcon } from "./file-type-icon";
import { cn } from "@/lib/utils";
import { useDocumentAttachments } from "../data/use-document-attachments";
import { useDocumentUploads, type UploadItem } from "../data/use-document-uploads";
import {
  documentContentUrl,
  previewKind,
  type DocumentEntityType,
  type DocumentFile,
  type DocumentLinkRef,
} from "../types/documents";
import { AttachDocumentDialog } from "./attach-document-dialog";
import { fileSize, shortDate } from "./document-format";
import { folderHref, type WithPath } from "./document-item";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import { DocumentStorageBadge } from "./document-storage-badge";
import { UploadProgressList } from "./upload-progress-list";

export type DocumentAttachmentsProps = {
  /** The kind of item, e.g. "bill" or "appliance" (see DOCUMENT_ENTITY_TYPES). */
  entityType: DocumentEntityType;
  entityId: string;
  /** Owners and adults upload, attach and detach; children see and download. */
  canManage: boolean;
  /** Heading of the panel; "Documents" by default. */
  title?: string;
  /** Drive folder new uploads go into; the drive root by default. */
  uploadFolderId?: string | null;
  /** Largest upload in bytes; bigger files are refused before uploading. Defaults to 100 MB. */
  maxUploadBytes?: number;
  /** Seed the list instead of fetching it (stories, or data that came with a loader). */
  initialFiles?: DocumentFile[];
  /** Stories: loads the attached files instead of the API (when `initialFiles` isn't given). */
  loadFiles?: (ref: DocumentLinkRef) => Promise<DocumentFile[]>;
  /** Stories: search function for "attach existing", and seeded uploads. */
  searchFiles?: (query: string) => Promise<WithPath<DocumentFile>[]>;
  initialUploads?: UploadItem[];
  /** Extra text after a file's size and date, e.g. "From mail on 2 Oct" (composed by the route). */
  fileNote?: (file: DocumentFile) => React.ReactNode;
  className?: string;
};

/**
 * Self-loading "Documents" panel for any item: lists the files attached to it, uploads new ones straight
 * onto it, attaches files already in the drive, detaches, and previews.
 *
 *   <DocumentAttachments entityType="bill" entityId={bill.id} canManage={canManageDocuments(user.role)} />
 */
export function DocumentAttachments({
  entityType,
  entityId,
  canManage,
  title,
  uploadFolderId = null,
  maxUploadBytes = 100_000_000,
  initialFiles,
  loadFiles,
  searchFiles,
  initialUploads,
  fileNote,
  className,
}: DocumentAttachmentsProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const { files, status, busyIds, reload, attach, detach, addUploaded } = useDocumentAttachments(entityType, entityId, {
    initial: initialFiles,
    load: loadFiles,
  });
  const uploads = useDocumentUploads({ maxBytes: maxUploadBytes, onUploaded: addUploaded, initial: initialUploads });
  const [attaching, setAttaching] = React.useState(false);
  const [previewing, setPreviewing] = React.useState<DocumentFile | null>(null);

  const open = (file: DocumentFile) => {
    if (previewKind(file.mimeType) !== "none") setPreviewing(file);
    else window.location.assign(documentContentUrl(file.id, { download: true }));
  };

  const handleDetach = (file: DocumentFile) =>
    void detach(file).then(
      () => toast.success(t("attachments.detached", { name: file.name })),
      () => toast.error(t("attachments.failed")),
    );

  const handleAttach = (file: DocumentFile) => {
    setAttaching(false);
    void attach(file).then(
      () => toast.success(t("attachments.attachedToast", { name: file.name })),
      () => toast.error(t("attachments.failed")),
    );
  };

  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-2">
          <PaperclipIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title ?? t("attachments.title")}
          {files.length > 0 && <span className="text-sm font-normal text-muted-foreground">{files.length}</span>}
        </CardTitle>
        {canManage && (
          <Button variant="outline" size="sm" disabled={status !== "ready"} onClick={() => setAttaching(true)}>
            {t("attachments.attachExisting")}
          </Button>
        )}
      </CardHeader>

      {status === "loading" ? (
        <div className="flex flex-col" role="status" aria-label={t("loading.attachments")}>
          {[55, 40].map((width) => (
            <div key={width} className="flex items-center gap-3 px-1 py-1.5">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4" style={{ width: `${width + 20}%` }} />
                <Skeleton className="h-3" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          {t("attachments.loadFailed")}
          <Button size="sm" variant="outline" onClick={reload}>
            {t("attachments.retry")}
          </Button>
        </div>
      ) : files.length === 0 && !canManage ? (
        <p className="text-sm text-muted-foreground">{t("attachments.empty")}</p>
      ) : (
        files.length > 0 && (
          <ul className="flex flex-col">
            {files.map((file) => (
              <li
                key={file.id}
                aria-busy={busyIds.has(file.id) || undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-1 py-1.5 transition-opacity hover:bg-accent/40",
                  busyIds.has(file.id) && "opacity-60",
                )}
              >
                <FileTypeIcon mimeType={file.mimeType} name={file.name} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    type="button"
                    className="truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                    onClick={() => open(file)}
                    title={file.name}
                  >
                    {file.name}
                  </button>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <DocumentStorageBadge file={file} />
                    <span className="truncate">
                      {fileSize(file.sizeBytes)} · {shortDate(file.uploadedAt ?? file.createdAt)}
                      {fileNote?.(file) ? <> · {fileNote(file)}</> : null}
                    </span>
                  </span>
                </div>
                {busyIds.has(file.id) ? (
                  // Being attached or detached: no menu until the server answered.
                  <span className="relative z-[1] grid size-8 shrink-0 place-items-center">
                    <Spinner label={tCommon("loading.updating")} className="text-muted-foreground" />
                  </span>
                ) : (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="relative z-[1]" aria-label={t("actions.menu", { name: file.name })}>
                        <MoreVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      {previewKind(file.mimeType) !== "none" && (
                        <DropdownMenuItem onSelect={() => setPreviewing(file)}>
                          <EyeIcon />
                          {t("actions.preview")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild>
                        <a href={documentContentUrl(file.id, { download: true })} download={file.name}>
                          <DownloadIcon />
                          {t("actions.download")}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={folderHref(file.folderId)}>
                          <FolderOpenIcon />
                          {t("attachments.showInDrive")}
                        </Link>
                      </DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => handleDetach(file)}>
                            <UnlinkIcon />
                            {t("attachments.detach")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {canManage && status !== "error" && (
        <>
          <UploadProgressList
            items={uploads.items}
            onCancel={uploads.cancel}
            onCancelAll={uploads.cancelAll}
            onClear={uploads.clearFinished}
            className="border-0 p-0 shadow-none"
          />
          <FileDropZone
            compact
            multiple
            onFiles={(list) => uploads.upload(list, { folderId: uploadFolderId, link: { entityType, entityId } })}
            title={t("attachments.dropTitle")}
            description={t("attachments.dropDescription", { size: fileSize(maxUploadBytes) })}
            buttonLabel={t("actions.upload")}
          />
        </>
      )}

      <AttachDocumentDialog
        open={attaching}
        onOpenChange={setAttaching}
        onSelect={handleAttach}
        attachedIds={files.map((file) => file.id)}
        search={searchFiles}
      />
      <DocumentPreviewDialog file={previewing} onOpenChange={(next) => !next && setPreviewing(null)} />
    </Card>
  );
}
