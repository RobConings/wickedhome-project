import * as React from "react";
import { FolderPlusIcon, HardDriveIcon, SearchXIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useLocation, useNavigate, useNavigation, useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { Stack } from "@/components/layout/stack";
import { BreadcrumbTrail, type BreadcrumbItem } from "@/components/shared/breadcrumb-trail";
import { EmptyState } from "@/components/shared/empty-state";
import { FileDropArea, FileDropZone } from "@/components/shared/file-drop-zone";
import { GeneralList, type ListView } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { sortDocuments } from "../components/document-format";
import {
  folderHref,
  itemId,
  itemName,
  toListEntries,
  type DocumentItem,
  type OnDocumentAction,
} from "../components/document-item";
import { FileMenuItemsContext, type FileMenuItems } from "../components/file-menu-items";
import { DocumentListItem } from "../components/document-list-item";
import { DocumentPreviewDialog } from "../components/document-preview-dialog";
import { DocumentTile } from "../components/document-tile";
import { DocumentsToolbar } from "../components/documents-toolbar";
import { FileRenameDialog } from "../components/file-rename-dialog";
import { FolderFormDialog } from "../components/folder-form-dialog";
import { MoveToFolderDialog } from "../components/move-to-folder-dialog";
import { StorageUsageMeter } from "../components/storage-usage-meter";
import { UploadProgressList } from "../components/upload-progress-list";
import type { DocumentActionResult, DocumentsLoaderData } from "../data/documents-loaders";
import { useDocumentUploads, type UploadItem } from "../data/use-document-uploads";
import { useDocumentView } from "../data/use-document-view";
import { useSettled } from "../data/use-settled";
import { documentContentUrl, previewKind, type DocumentFile, type DocumentFolder } from "../types/documents";

type DocumentsScreenProps = {
  data: DocumentsLoaderData;
  /** Owners and adults upload and organise; children browse and download. */
  canManage: boolean;
  /** Seed the upload list (stories). */
  initialUploads?: UploadItem[];
  /** Start in this view instead of the remembered one, and don't remember changes (stories). */
  initialView?: ListView;
  /** Shown above the list at the drive root (not while searching), e.g. linked Drive folders. Composed by the route. */
  rootExtras?: React.ReactNode;
  /** Extra items in a file's ⋯ menu (e.g. "Save to Drive"), composed by the route. */
  fileMenuItems?: FileMenuItems;
};

const FOLDERS_GROUP = "folders";
const FILES_GROUP = "files";

/** The household drive: folders and files, like Google Drive, with uploads, search and the trash. */
export function DocumentsScreen({ data, canManage, initialUploads, initialView, rootExtras, fileMenuItems }: DocumentsScreenProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const { contents, search, query } = data;
  const { folder, breadcrumbs } = contents;
  // Deferred by the loader: the last value stays while a newer one loads, so nothing blanks on reloads.
  const usage = useSettled(data.usage);
  const folders = useSettled(data.folders);
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const browsing = useBrowsePending();
  const [, setSearchParams] = useSearchParams();
  const { sort, setSort, defaultView } = useDocumentView();

  // Dialogs: one instance each, opened for the item the menu was used on.
  const [folderDialog, setFolderDialog] = React.useState<{ open: boolean; folder: DocumentFolder | null; key: number }>({
    open: false,
    folder: null,
    key: 0,
  });
  const [renaming, setRenaming] = React.useState<DocumentFile | null>(null);
  const [moving, setMoving] = React.useState<DocumentItem | null>(null);
  const [previewing, setPreviewing] = React.useState<DocumentFile | null>(null);

  // Reload the folder after uploads, at most twice a second.
  const reloadTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const uploads = useDocumentUploads({
    // Until the usage arrives the server still refuses files that are too large.
    maxBytes: usage.value?.maxUploadBytes,
    initial: initialUploads,
    onUploaded: () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void revalidator.revalidate(), 500);
    },
  });
  React.useEffect(() => () => clearTimeout(reloadTimer.current), []);
  const uploadHere = (files: File[]) => uploads.upload(files, { folderId: folder?.id ?? null });

  const trashFetcher = useTrashWithUndo();

  const openFolderDialog = (target: DocumentFolder | null) =>
    setFolderDialog((current) => ({ open: true, folder: target, key: current.key + 1 }));

  const handleAction: OnDocumentAction = (action, item) => {
    switch (action) {
      case "open":
        if (item.kind === "folder") navigate(folderHref(item.folder.id));
        else if (previewKind(item.file.mimeType) !== "none") setPreviewing(item.file);
        else window.location.assign(documentContentUrl(item.file.id, { download: true }));
        break;
      case "download":
        if (item.kind === "file") window.location.assign(documentContentUrl(item.file.id, { download: true }));
        break;
      case "rename":
        if (item.kind === "folder") openFolderDialog(item.folder);
        else setRenaming(item.file);
        break;
      case "move":
        setMoving(item);
        break;
      case "trash":
        trashFetcher.trash(item);
        break;
    }
  };

  // Whatever is being moved to the trash disappears at once; it comes back if that fails.
  const visible = <T extends { id: string }>(list: T[]) =>
    trashFetcher.trashingId ? list.filter((entry) => entry.id !== trashFetcher.trashingId) : list;
  // The search (`?q=`, filtered by the loader) looks in all folders; otherwise this folder's contents.
  const shown = search
    ? sortDocuments(visible(search.folders), visible(search.files), sort)
    : sortDocuments(visible(contents.folders), visible(contents.files), sort);
  const entries = toListEntries(shown.folders, shown.files);

  const fileInput = React.useRef<HTMLInputElement>(null);
  const actions = (
    <>
      <Button variant="outline" asChild>
        <Link to="/documents/trash">
          <Trash2Icon />
          {t("trash.title")}
        </Link>
      </Button>
      {canManage && (
        <>
          <Button variant="outline" onClick={() => openFolderDialog(null)}>
            <FolderPlusIcon />
            {t("actions.newFolder")}
          </Button>
          <Button onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            {t("actions.upload")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              uploadHere(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </>
      )}
    </>
  );

  const crumbs: BreadcrumbItem[] = folder
    ? [
        { label: t("page.title"), to: "/documents", icon: HardDriveIcon },
        ...breadcrumbs.map((crumb) => ({ label: crumb.name, to: folderHref(crumb.id) })),
        { label: folder.name },
      ]
    : [];

  const emptyTitle = folder ? t("empty.folderTitle") : t("empty.driveTitle");
  const clearSearch = () =>
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.delete("q");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={crumbs.length > 0 ? <BreadcrumbTrail items={crumbs} label={t("breadcrumbs")} /> : undefined}
        title={folder?.name ?? t("page.title")}
        description={folder ? undefined : t("page.description")}
        actions={actions}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Stack gap="md">
          <UploadProgressList
            items={uploads.items}
            onCancel={uploads.cancel}
            onCancelAll={uploads.cancelAll}
            onClear={uploads.clearFinished}
          />
          {!folder && !search && rootExtras}
          <FileMenuItemsContext value={fileMenuItems ?? null}>
          <FileDropArea
            onFiles={uploadHere}
            disabled={!canManage || Boolean(search) || browsing !== null}
            overlayTitle={t("upload.dropTitle", { folder: folder?.name ?? t("page.title") })}
            className="min-h-40"
          >
            <GeneralList
              label={folder?.name ?? t("page.title")}
              items={entries}
              getKey={(entry) => `${entry.kind}-${itemId(entry)}`}
              renderRow={(entry) => (
                <DocumentListItem item={entry} canManage={canManage} onAction={handleAction} showPath={Boolean(search)} />
              )}
              renderTile={(entry) => <DocumentTile item={entry} canManage={canManage} onAction={handleAction} />}
              // Searches the whole drive on the server: the query lives in `?q=` and reruns the loader.
              search={{ param: "q", label: t("toolbar.search"), placeholder: t("toolbar.search") }}
              // Stories pass `initialView` and don't remember the view.
              storageKey={initialView ? undefined : "documents"}
              defaultView={initialView ?? defaultView}
              actions={<DocumentsToolbar sort={sort} onSortChange={setSort} />}
              toolbar={search && <p className="text-sm text-muted-foreground">{t("search.results", { query })}</p>}
              groupBy={(entry) => (entry.kind === "folder" ? FOLDERS_GROUP : FILES_GROUP)}
              groupOrder={[FOLDERS_GROUP, FILES_GROUP]}
              renderGroupHeader={(key) => (key === FOLDERS_GROUP ? t("list.folders") : t("list.files"))}
              // Another folder or a search is loading: keep this one visible, faded, until it is there.
              pending={browsing !== null}
              emptyState={
                canManage ? (
                  <FileDropZone
                    multiple
                    onFiles={uploadHere}
                    title={emptyTitle}
                    description={t("empty.dropDescription")}
                    buttonLabel={t("actions.chooseFiles")}
                  />
                ) : (
                  <EmptyState icon={HardDriveIcon} title={emptyTitle} />
                )
              }
              noResultsState={
                <EmptyState
                  icon={SearchXIcon}
                  title={t("search.emptyTitle", { query })}
                  description={t("search.emptyDescription")}
                  action={
                    <Button variant="outline" onClick={clearSearch}>
                      {tCommon("list.clearSearch")}
                    </Button>
                  }
                />
              }
            />
          </FileDropArea>
          </FileMenuItemsContext>
        </Stack>
        <StorageUsageMeter usage={usage.value} failed={usage.failed} onRetry={() => void revalidator.revalidate()} />
      </div>

      <FolderFormDialog
        key={folderDialog.key}
        open={folderDialog.open}
        folder={folderDialog.folder}
        parentId={folder?.id ?? null}
        onOpenChange={(open) => setFolderDialog((current) => ({ ...current, open }))}
      />
      <FileRenameDialog file={renaming} onOpenChange={(open) => !open && setRenaming(null)} />
      <MoveToFolderDialog
        item={moving}
        folders={folders.value}
        foldersFailed={folders.failed}
        onRetry={() => void revalidator.revalidate()}
        onOpenChange={(open) => !open && setMoving(null)}
      />
      <DocumentPreviewDialog file={previewing} onOpenChange={(open) => !open && setPreviewing(null)} />
    </PageContainer>
  );
}

const isDrivePath = (pathname: string) => pathname === "/documents" || pathname.startsWith("/documents/folders/");

/**
 * What the drive is loading right now: `"folder"` while going to another folder (a different pathname of
 * this same screen, which `useSamePagePending` doesn't cover), `"search"` while the `?q=` changes, else `null`.
 */
function useBrowsePending(): "folder" | "search" | null {
  const navigation = useNavigation();
  const location = useLocation();
  const target = navigation.state === "loading" ? navigation.location : undefined;
  if (!target || !isDrivePath(target.pathname)) return null;
  return target.pathname === location.pathname ? "search" : "folder";
}

/** Moving to the trash needs no confirmation: a toast offers Undo instead. */
function useTrashWithUndo() {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<DocumentActionResult>({ key: "documents-trash" });
  const restoreFetcher = useFetcher<DocumentActionResult>({ key: "documents-undo-trash" });
  const pending = React.useRef<DocumentItem | null>(null);
  const restoring = React.useRef<DocumentItem | null>(null);

  // Undo: confirm once it is back (or say it failed).
  React.useEffect(() => {
    const item = restoring.current;
    if (restoreFetcher.state !== "idle" || !restoreFetcher.data || !item) return;
    restoring.current = null;
    if (restoreFetcher.data.ok) toast.success(t("trash.restored", { name: itemName(item) }));
    else toast.error(restoreFetcher.data.formError ?? tCommon("errors.generic"));
  }, [restoreFetcher.state, restoreFetcher.data, t, tCommon]);

  React.useEffect(() => {
    const item = pending.current;
    if (fetcher.state !== "idle" || !fetcher.data || !item) return;
    pending.current = null;
    if (fetcher.data.ok) {
      toast.success(t("trash.moved", { name: itemName(item) }), {
        action: {
          label: t("actions.undo"),
          onClick: () => {
            restoring.current = item;
            void restoreFetcher.submit({ intent: "restore", kind: item.kind, id: itemId(item) }, { method: "post" });
          },
        },
      });
    } else {
      toast.error(fetcher.data.formError ?? tCommon("errors.generic"));
    }
  }, [fetcher.state, fetcher.data, restoreFetcher, t, tCommon]);

  const trashingId = fetcher.state !== "idle" ? fetcher.formData?.get("id") : null;
  return {
    /** The item on its way to the trash, hidden from the list until the folder reloads without it. */
    trashingId: typeof trashingId === "string" ? trashingId : null,
    trash: (item: DocumentItem) => {
      pending.current = item;
      void fetcher.submit({ intent: "trash", kind: item.kind, id: itemId(item) }, { method: "post" });
    },
  };
}
