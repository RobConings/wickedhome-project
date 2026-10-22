import { currentLocale } from "@/lib/i18n";
import type { DocumentSort } from "../data/use-document-view";
import type { DocumentFile, DocumentFolder } from "../types/documents";

/** When a file was last changed: its upload, or a later rename/move. */
export const fileModified = (file: DocumentFile) => file.updatedAt;

const collator = () => new Intl.Collator(currentLocale(), { numeric: true, sensitivity: "base" });

/** Sorts folders and files the same way; folders always come first (the caller renders them first). */
export function sortDocuments<F extends DocumentFolder, D extends DocumentFile>(folders: F[], files: D[], sort: DocumentSort) {
  const { compare } = collator();
  const sign = sort.direction === "asc" ? 1 : -1;
  const byName = (a: { name: string }, b: { name: string }) => compare(a.name, b.name);
  const folderOrder = (a: F, b: F) =>
    sign * (sort.key === "modified" ? a.updatedAt.localeCompare(b.updatedAt) || byName(a, b) : byName(a, b));
  const fileOrder = (a: D, b: D) => {
    if (sort.key === "size") return sign * (a.sizeBytes - b.sizeBytes || byName(a, b));
    if (sort.key === "modified") return sign * (fileModified(a).localeCompare(fileModified(b)) || byName(a, b));
    return sign * byName(a, b);
  };
  return { folders: [...folders].sort(folderOrder), files: [...files].sort(fileOrder) };
}
