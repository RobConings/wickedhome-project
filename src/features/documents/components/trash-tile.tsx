import { Card } from "@/components/shared/card";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import { cn } from "@/lib/utils";
import { itemName } from "./document-item";
import { FolderGlyph } from "./folder-glyph";
import { isTrashBusyFor, useTrashDetail } from "./trash-item";
import { TrashItemActions } from "./trash-item-actions";
import type { TrashItemProps } from "./trash-list-item";

/** A trashed folder or file as a tile (two per row on a phone): icon, name, when it was trashed, actions. */
export function TrashTile({ item, canManage, busy = null, onRestore, onDelete }: TrashItemProps) {
  const detail = useTrashDetail();
  const name = itemName(item);
  return (
    <Card className={cn("gap-3 p-4 transition-opacity", isTrashBusyFor(busy, item) && "opacity-60")}>
      {item.kind === "folder" ? (
        <FolderGlyph color={item.folder.color} size="lg" />
      ) : (
        <FileTypeIcon mimeType={item.file.mimeType} name={item.file.name} size="lg" />
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 font-medium break-words" title={name}>
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{detail(item)}</span>
      </div>
      {canManage && (
        <TrashItemActions item={item} busy={busy} onRestore={onRestore} onDelete={onDelete} compact className="mt-auto" />
      )}
    </Card>
  );
}
