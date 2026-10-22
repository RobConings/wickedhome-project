import { api, resourcePath, withQuery } from "@/lib/api-client";
import { uploadBlob, type UploadProgress } from "@/lib/upload";
import {
  FALLBACK_MIME_TYPE,
  normalizeMimeType,
  type DocumentFile,
  type DocumentFolder,
  type DocumentLinkInput,
  type DocumentLinkRef,
  type DocumentSearchResult,
  type DocumentTrash,
  type FileCreateInput,
  type FileUpdateInput,
  type FolderContents,
  type FolderCreateInput,
  type FolderUpdateInput,
  type StorageUsage,
} from "../types/documents";

const folderPath = resourcePath("/documents/folders");
const filePath = resourcePath("/documents/files");
const trashPath = resourcePath("/documents/trash");

export const fetchContents = (folderId?: string) =>
  api.get<FolderContents>(withQuery("/documents/contents", { folderId }));
export const fetchFolders = () => api.get<DocumentFolder[]>("/documents/folders");
export const searchDocuments = (q: string) =>
  api.get<DocumentSearchResult>(`/documents/search?q=${encodeURIComponent(q)}`);
export const fetchUsage = () => api.get<StorageUsage>("/documents/usage");
export const fetchTrash = () => api.get<DocumentTrash>("/documents/trash");

export const createFolder = (input: FolderCreateInput) => api.post<DocumentFolder>("/documents/folders", input);
export const updateFolder = (folderId: string, input: FolderUpdateInput) =>
  api.patch<DocumentFolder>(folderPath(folderId), input);
export const trashFolder = (folderId: string) => api.delete(folderPath(folderId));
export const restoreFolder = (folderId: string) => api.post<DocumentFolder>(folderPath(folderId, "restore"));
export const deleteFolderPermanently = (folderId: string) => api.delete(trashPath("folders", folderId));

export const createFile = (input: FileCreateInput) => api.post<DocumentFile>("/documents/files", input);
export const updateFile = (fileId: string, input: FileUpdateInput) =>
  api.patch<DocumentFile>(filePath(fileId), input);
export const trashFile = (fileId: string) => api.delete(filePath(fileId));
export const restoreFile = (fileId: string) => api.post<DocumentFile>(filePath(fileId, "restore"));
export const deleteFilePermanently = (fileId: string) => api.delete(trashPath("files", fileId));
export const emptyTrash = () => api.delete("/documents/trash");

/** Streams the file's bytes as the raw request body, with progress. */
export const uploadFileContent = (
  fileId: string,
  body: Blob,
  options: { contentType: string; onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal },
) => uploadBlob<DocumentFile>(filePath(fileId, "content"), body, options);

export type UploadDocumentOptions = {
  /** Display name including extension; the blob's own name (for a File) by default. */
  name?: string;
  /** Drive folder; the root by default. */
  folderId?: string | null;
  /** Attach the file to an item as soon as it is registered. */
  link?: DocumentLinkRef;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

/**
 * Registers a file and streams its content in one go, for other features that store a file as a document
 * (e.g. the floor plan import). Rejects with `ApiRequestError` (413 when too large, `aborted` when cancelled).
 */
export async function uploadDocument(blob: Blob, options: UploadDocumentOptions = {}): Promise<DocumentFile> {
  const { name = blob instanceof File ? blob.name : "file", folderId = null, link, onProgress, signal } = options;
  const registered = await createFile({
    name,
    folderId,
    mimeType: normalizeMimeType(blob.type) || FALLBACK_MIME_TYPE,
    sizeBytes: blob.size,
    link,
  });
  return uploadFileContent(registered.id, blob, { contentType: registered.mimeType, onProgress, signal });
}

export const fetchLinkedFiles =({ entityType, entityId }: DocumentLinkRef) =>
  api.get<DocumentFile[]>(`/documents/links?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`);
export const attachFile = (input: DocumentLinkInput) => api.post("/documents/links", input);
export const detachFile = ({ fileId, entityType, entityId }: DocumentLinkInput) =>
  api.delete(resourcePath("/documents/links")(fileId, entityType, entityId));
