import * as React from "react";
import { Link } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/shared/card";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import type { DocumentFile, DocumentFolder } from "../types/documents";
import { fileModified, fileSize, shortDate } from "./document-format";
import { folderHref, type OnDocumentAction } from "./document-item";
import { DocumentItemMenu } from "./document-item-menu";
import type { DocumentEntryProps } from "./document-list-item";
import { DocumentStorageBadge } from "./document-storage-badge";
import { FolderGlyph } from "./folder-glyph";
import { useFolderSummary } from "./use-folder-summary";
import { useOpeningFolder } from "./use-opening-folder";

const tileClass = "relative gap-2 transition-colors hover:bg-accent/40";
/** Makes the name's link or button cover the whole tile. */
const overlay =
  "truncate text-left font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50";

/**
 * A folder or file as a tile (two per row on a phone): a folder with its colour and what's in it, a file
 * with a large type icon, its size and date. The ⋯ menu (or a right-click) has the actions.
 */
export function DocumentTile({ item, canManage, onAction }: DocumentEntryProps) {
  return item.kind === "folder" ? (
    <FolderTile folder={item.folder} canManage={canManage} onAction={onAction} />
  ) : (
    <FileTile file={item.file} canManage={canManage} onAction={onAction} />
  );
}

type MenuProps = { canManage: boolean; onAction: OnDocumentAction };

function useContextMenu() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return {
    menu: { open: menuOpen, onOpenChange: setMenuOpen },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      setMenuOpen(true);
    },
  };
}

function FolderTile({ folder, canManage, onAction }: MenuProps & { folder: DocumentFolder }) {
  const summary = useFolderSummary();
  const opening = useOpeningFolder(folder.id);
  const { menu, onContextMenu } = useContextMenu();
  return (
    <Card className={`${tileClass} p-3`} aria-busy={opening || undefined} onContextMenu={onContextMenu}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center">
          {opening ? <Spinner className="size-6 text-primary" /> : <FolderGlyph color={folder.color} size="lg" />}
        </span>
        <DocumentItemMenu
          item={{ kind: "folder", folder }}
          canManage={canManage}
          onAction={onAction}
          className="-mt-1 -mr-1"
          {...menu}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <Link to={folderHref(folder.id)} className={overlay} title={folder.name}>
          {folder.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{summary(folder)}</span>
      </div>
    </Card>
  );
}

function FileTile({ file, canManage, onAction }: MenuProps & { file: DocumentFile }) {
  const { menu, onContextMenu } = useContextMenu();
  const item = { kind: "file", file } as const;
  return (
    <Card className={`${tileClass} p-2`} onContextMenu={onContextMenu}>
      <div className="relative grid aspect-[4/3] place-items-center rounded-lg bg-muted/50">
        <FileTypeIcon mimeType={file.mimeType} name={file.name} size="lg" />
        <DocumentStorageBadge file={file} className="absolute bottom-1.5 left-1.5" />
      </div>
      <div className="flex items-start gap-1 pl-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <button type="button" className={overlay} onClick={() => onAction("open", item)} title={file.name}>
            {file.name}
          </button>
          <span className="truncate text-xs text-muted-foreground">
            {fileSize(file.sizeBytes)} · {shortDate(fileModified(file))}
          </span>
        </div>
        <DocumentItemMenu item={item} canManage={canManage} onAction={onAction} {...menu} />
      </div>
    </Card>
  );
}
