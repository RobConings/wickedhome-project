import type { DocumentFile, DocumentFolder, FolderCrumb } from "../types/documents";

/** A folder or a file, as shown in the drive's grid and list. */
export type DocumentItem = { kind: "folder"; folder: DocumentFolder } | { kind: "file"; file: DocumentFile };

export type DocumentAction = "open" | "download" | "rename" | "move" | "trash";
export type OnDocumentAction = (action: DocumentAction, item: DocumentItem) => void;

/** Search results carry the folder path they are in. */
export type WithPath<T> = T & { path?: FolderCrumb[] };

/** An entry of the drive's list: a folder or a file, with its path when it is a search result. */
export type DocumentListEntry =
  | { kind: "folder"; folder: WithPath<DocumentFolder> }
  | { kind: "file"; file: WithPath<DocumentFile> };

/** Folders first, then files, as list entries. */
export const toListEntries = (
  folders: readonly WithPath<DocumentFolder>[],
  files: readonly WithPath<DocumentFile>[],
): DocumentListEntry[] => [
  ...folders.map((folder): DocumentListEntry => ({ kind: "folder", folder })),
  ...files.map((file): DocumentListEntry => ({ kind: "file", file })),
];

export const itemId = (item: DocumentItem) => (item.kind === "folder" ? item.folder.id : item.file.id);
export const itemName = (item: DocumentItem) => (item.kind === "folder" ? item.folder.name : item.file.name);

export const folderHref = (folderId: string | null) => (folderId ? `/documents/folders/${folderId}` : "/documents");
