import { useTranslation } from "react-i18next";
import { fileSize, shortDate } from "./document-format";
import { itemId, type DocumentItem } from "./document-item";
import { useFolderSummary } from "./use-folder-summary";

/** The action in progress: on one item (`id`), or on the whole trash (no `id`, e.g. emptying it). */
export type TrashBusy = { intent: "restore" | "delete" | "empty-trash"; id?: string };

/** True when the busy action is about this item (or about the whole trash): it fades and its button spins. */
export const isTrashBusyFor = (busy: TrashBusy | null | undefined, item: DocumentItem): boolean =>
  busy !== null && busy !== undefined && (busy.id === undefined || busy.id === itemId(item));

/** "3 files · trashed 2 Oct 2026", for a row or tile of the trash. */
export function useTrashDetail() {
  const { t } = useTranslation("documents");
  const summary = useFolderSummary();
  return (item: DocumentItem) => {
    const deletedAt = item.kind === "folder" ? item.folder.deletedAt : item.file.deletedAt;
    const detail = item.kind === "folder" ? summary(item.folder) : fileSize(item.file.sizeBytes);
    return deletedAt ? `${detail} · ${t("trash.trashedOn", { date: shortDate(deletedAt) })}` : detail;
  };
}
