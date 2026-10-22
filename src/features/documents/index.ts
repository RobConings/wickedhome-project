// Public API of the documents feature. Routes, the app frame and other features import from here only.
export { DocumentAttachments, type DocumentAttachmentsProps } from "./components/document-attachments";
export { DocumentPreviewDialog, type PreviewFile } from "./components/document-preview-dialog";
export {
  documentsAction,
  documentsLoader,
  documentsTrashAction,
  documentsTrashLoader,
  type DocumentsLoaderData,
  type DocumentsTrashLoaderData,
} from "./data/documents-loaders";
export { fetchLinkedFiles, uploadDocument, type UploadDocumentOptions } from "./data/documents-requests";
export { DocumentsScreen } from "./screens/documents-screen";
export type { FileMenuItems } from "./components/file-menu-items";
export { DocumentsTrashScreen } from "./screens/documents-trash-screen";
export {
  DOCUMENT_ENTITY_TYPES,
  canManageDocuments,
  documentContentUrl,
  type DocumentEntityType,
  type DocumentFile,
  type DocumentFolder,
  type StorageTargetKind,
} from "./types/documents";
