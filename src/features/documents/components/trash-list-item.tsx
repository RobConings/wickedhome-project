import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { cn } from "@/lib/utils";
import { itemName } from "./document-item";
import { FolderGlyph } from "./folder-glyph";
import { isTrashBusyFor, useTrashDetail } from "./trash-item";
import { TrashItemActions, type TrashItemActionsProps } from "./trash-item-actions";

export type TrashItemProps = Omit<TrashItemActionsProps, "compact" | "className"> & {
  /** Show restore and delete; children only look. */
  canManage: boolean;
};

/** A trashed folder or file as a row of the trash list: what it is, when it was trashed, restore and delete. */
export function TrashListItem({ item, canManage, busy = null, onRestore, onDelete }: TrashItemProps) {
  const detail = useTrashDetail();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3 transition-opacity sm:flex-nowrap",
        isTrashBusyFor(busy, item) && "opacity-60",
      )}
    >
      {item.kind === "folder" ? (
        <span className="grid size-8 shrink-0 place-items-center">
          <FolderGlyph color={item.folder.color} />
        </span>
      ) : (
        <FileTypeIcon mimeType={item.file.mimeType} name={item.file.name} size="sm" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{itemName(item)}</span>
        <span className="truncate text-xs text-muted-foreground">{detail(item)}</span>
      </div>
      {canManage && (
        <TrashItemActions item={item} busy={busy} onRestore={onRestore} onDelete={onDelete} className="ml-11 sm:ml-0" />
      )}
    </div>
  );
}
