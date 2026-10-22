import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeIcon } from "./file-type-icon";
import { fileModified, fileSize, shortDate } from "./document-format";
import { folderHref, type DocumentListEntry, type OnDocumentAction } from "./document-item";
import { DocumentItemMenu } from "./document-item-menu";
import { DocumentStorageBadge } from "./document-storage-badge";
import { FolderGlyph } from "./folder-glyph";
import { useFolderSummary } from "./use-folder-summary";
import { useOpeningFolder } from "./use-opening-folder";

export type DocumentEntryProps = {
  item: DocumentListEntry;
  canManage: boolean;
  onAction: OnDocumentAction;
};

type DocumentListItemProps = DocumentEntryProps & {
  /** Show the folder the item is in (search results). */
  showPath?: boolean;
};

/** Makes the name's link or button cover the whole row, so the row is one big touch target. */
const overlay =
  "truncate text-left font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50";

/**
 * A folder or file as a row of the drive's list: icon, name (opens it), what's in it or its size and date,
 * and the ⋯ menu (a right-click opens it too).
 */
export function DocumentListItem({ item, canManage, onAction, showPath = false }: DocumentListItemProps) {
  const { t } = useTranslation("documents");
  const summary = useFolderSummary();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const isFolder = item.kind === "folder";
  const opening = useOpeningFolder(isFolder ? item.folder.id : null);
  const name = isFolder ? item.folder.name : item.file.name;
  const detail = isFolder ? summary(item.folder) : `${fileSize(item.file.sizeBytes)} · ${shortDate(fileModified(item.file))}`;
  const path = showPath ? (isFolder ? item.folder.path : item.file.path) : undefined;
  const pathLabel = path && (path.length ? path.map((crumb) => crumb.name).join(" / ") : t("page.title"));

  return (
    <div
      className="relative -mx-2 -my-1 flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-accent/40"
      aria-busy={opening || undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {isFolder ? (
        <span className="grid size-8 shrink-0 place-items-center">
          {opening ? <Spinner className="size-5 text-primary" /> : <FolderGlyph color={item.folder.color} />}
        </span>
      ) : (
        <FileTypeIcon mimeType={item.file.mimeType} name={item.file.name} size="sm" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isFolder ? (
          <Link to={folderHref(item.folder.id)} className={overlay}>
            {name}
          </Link>
        ) : (
          <button type="button" className={overlay} onClick={() => onAction("open", item)} title={name}>
            {name}
          </button>
        )}
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {!isFolder && <DocumentStorageBadge file={item.file} />}
          <span className="truncate">{pathLabel ? `${t("list.in", { path: pathLabel })} · ${detail}` : detail}</span>
        </span>
      </div>
      <DocumentItemMenu item={item} canManage={canManage} onAction={onAction} open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}
