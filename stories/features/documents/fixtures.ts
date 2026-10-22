import type { DocumentsLoaderData } from "@/features/documents/data/documents-loaders";
import type { UploadItem } from "@/features/documents/data/use-document-uploads";
import type {
  DocumentFile,
  DocumentFolder,
  DocumentSearchResult,
  DocumentTrash,
  FolderCrumb,
  StorageUsage,
} from "@/features/documents/types/documents";

const MB = 1000 * 1000;
const jan = { id: "u-jan", name: "Jan" };
const lies = { id: "u-lies", name: "Lies" };

const folder = (
  id: string,
  name: string,
  parentId: string | null,
  extra: Partial<DocumentFolder> = {},
): DocumentFolder => ({
  id,
  name,
  parentId,
  color: null,
  folderCount: 0,
  fileCount: 0,
  createdAt: "2026-01-04T09:12:00.000Z",
  updatedAt: "2026-01-04T09:12:00.000Z",
  deletedAt: null,
  ...extra,
});

const file = (
  id: string,
  name: string,
  folderId: string | null,
  mimeType: string,
  sizeBytes: number,
  uploadedAt: string,
  extra: Partial<DocumentFile> = {},
): DocumentFile => ({
  id,
  name,
  folderId,
  mimeType,
  sizeBytes,
  sha256: "9f2c1b0e7d4a3c5b8e6f0a1d2c3b4a5968778695a4b3c2d1e0f9e8d7c6b5a4f3",
  storageProvider: "local",
  uploadedBy: jan,
  uploadedAt,
  createdAt: uploadedAt,
  updatedAt: uploadedAt,
  deletedAt: null,
  ...extra,
});

/** A Belgian household's drive. */
export const documentFolders = {
  huis: folder("f-huis", "Huis", null, { color: "#124734", folderCount: 1, fileCount: 2, updatedAt: "2026-03-02T10:00:00.000Z" }),
  notaris: folder("f-notaris", "Notaris akte", "f-huis", { fileCount: 2 }),
  verzekeringen: folder("f-verzekeringen", "Verzekeringen", null, { color: "#2a78d6", fileCount: 3 }),
  garanties: folder("f-garanties", "Garanties", null, { color: "#eda100", fileCount: 4, updatedAt: "2026-05-18T16:40:00.000Z" }),
  facturen: folder("f-facturen", "Facturen 2026", null, { color: "#e34948", fileCount: 11, updatedAt: "2026-09-28T08:15:00.000Z" }),
  energie: folder("f-energie", "Energie", null, { color: "#1baf7a", fileCount: 3, updatedAt: "2026-09-01T07:30:00.000Z" }),
  scans: folder("f-scans", "Scans", null),
} satisfies Record<string, DocumentFolder>;

export const documentFiles = {
  akte: file("d-akte", "Notarisakte Dorpsstraat 12.pdf", "f-notaris", "application/pdf", 2.4 * MB, "2026-01-04T09:20:00.000Z"),
  hypotheek: file("d-hypotheek", "Hypotheekakte KBC.pdf", "f-notaris", "application/pdf", 1.1 * MB, "2026-01-04T09:22:00.000Z"),
  plans: file("d-plans", "Bouwplannen gelijkvloers.pdf", "f-huis", "application/pdf", 8.7 * MB, "2026-02-11T19:05:00.000Z", {
    uploadedBy: lies,
  }),
  epc: file("d-epc", "EPC-attest 2025.pdf", "f-huis", "application/pdf", 640_000, "2026-03-02T10:00:00.000Z"),
  brandpolis: file("d-brandpolis", "Brandverzekering polis 2026.pdf", "f-verzekeringen", "application/pdf", 410_000, "2026-01-15T12:00:00.000Z"),
  wasmachine: file("d-wasmachine", "Garantiebewijs Miele wasmachine.pdf", "f-garanties", "application/pdf", 180_000, "2026-05-18T16:40:00.000Z"),
  fluvius2025: file("d-fluvius-2025", "Fluvius kwartierwaarden 2025.csv", "f-energie", "text/csv", 3.2 * MB, "2026-01-10T20:00:00.000Z"),
  fluvius2026: file("d-fluvius-2026", "Fluvius kwartierwaarden jan-aug 2026.csv", "f-energie", "text/csv", 2.1 * MB, "2026-09-01T07:30:00.000Z"),
  luminus: file("d-luminus", "Factuur Luminus september 2026.pdf", "f-facturen", "application/pdf", 96_000, "2026-09-28T08:15:00.000Z"),
  meterstand: file("d-meterstand", "Foto meterstand.jpg", null, "image/jpeg", 3.4 * MB, "2026-09-30T18:02:00.000Z", { uploadedBy: lies }),
  keuken: file("d-keuken", "Offerte keuken Vanhout.docx", null, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 52_000, "2026-08-21T14:10:00.000Z"),
  backup: file("d-backup", "Router backup.zip", null, "application/zip", 12.5 * MB, "2026-07-02T21:45:00.000Z"),
  rondleiding: file("d-rondleiding", "Rondleiding na renovatie.mp4", null, "video/mp4", 84 * MB, "2026-06-14T11:00:00.000Z"),
} satisfies Record<string, DocumentFile>;

export const documentUsage: StorageUsage = {
  usedBytes: 2.31 * 1000 * MB,
  fileCount: 48,
  trashBytes: 14 * MB,
  diskTotalBytes: 500 * 1000 * MB,
  diskFreeBytes: 312 * 1000 * MB,
  maxUploadBytes: 100 * MB,
};

const allFolders = Object.values(documentFolders);
/** Every folder of the drive, as the move dialog gets them. */
export const allDocumentFolders = allFolders;

/** A deferred loader value that never arrives: for "Loading" stories. */
export const neverResolves = <T>() => new Promise<T>(() => {});

export const rootLoaderData: DocumentsLoaderData = {
  contents: {
    folder: null,
    breadcrumbs: [],
    folders: allFolders.filter((value) => value.parentId === null),
    files: [documentFiles.meterstand, documentFiles.keuken, documentFiles.backup, documentFiles.rondleiding],
  },
  search: null,
  query: "",
  // Deferred by the loader.
  folders: Promise.resolve(allFolders),
  usage: Promise.resolve(documentUsage),
};

/** A deferred loader value that failed (already handled, so the browser doesn't report it). */
export const rejects = <T>() => {
  const promise = Promise.reject<T>(new Error("offline"));
  promise.catch(() => undefined);
  return promise;
};

/** The folder is there, the folder tree and the storage usage are still loading. */
export const deferredLoadingLoaderData: DocumentsLoaderData = {
  ...rootLoaderData,
  folders: neverResolves(),
  usage: neverResolves(),
};

export const notarisLoaderData: DocumentsLoaderData = {
  ...rootLoaderData,
  contents: {
    folder: documentFolders.notaris,
    breadcrumbs: [{ id: "f-huis", name: "Huis" }],
    folders: [],
    files: [documentFiles.akte, documentFiles.hypotheek],
  },
};

export const emptyFolderLoaderData: DocumentsLoaderData = {
  ...rootLoaderData,
  contents: { folder: documentFolders.scans, breadcrumbs: [], folders: [], files: [] },
};

const pathTo = (...crumbs: DocumentFolder[]): FolderCrumb[] => crumbs.map(({ id, name }) => ({ id, name }));

export const searchResults: DocumentSearchResult = {
  folders: [],
  files: [
    { ...documentFiles.fluvius2025, path: pathTo(documentFolders.energie) },
    { ...documentFiles.fluvius2026, path: pathTo(documentFolders.energie) },
  ],
};

export const searchLoaderData: DocumentsLoaderData = { ...rootLoaderData, search: searchResults, query: "fluvius" };

export const documentTrash: DocumentTrash = {
  folders: [folder("f-oud", "Oude huurcontracten", null, { fileCount: 3, deletedAt: "2026-09-20T10:00:00.000Z" })],
  files: [
    file("d-oud-1", "Factuur Proximus augustus.pdf", "f-facturen", "application/pdf", 88_000, "2026-08-30T09:00:00.000Z", {
      deletedAt: "2026-09-29T17:30:00.000Z",
    }),
    file("d-oud-2", "IMG_2041.HEIC", null, "image/heic", 2.9 * MB, "2026-07-12T13:00:00.000Z", {
      deletedAt: "2026-09-25T08:00:00.000Z",
    }),
  ],
  totalBytes: 14 * MB,
};

/** The trash as list items: a trashed folder and a trashed file, for row and tile stories. */
export const trashedFolderItem = { kind: "folder", folder: documentTrash.folders[0]! } as const;
export const trashedFileItem = { kind: "file", file: documentTrash.files[0]! } as const;

/** Drive contents as list items, for row and tile stories. */
export const folderItem = { kind: "folder", folder: documentFolders.facturen } as const;
export const fileItem = { kind: "file", file: documentFiles.meterstand } as const;
export const searchFileItem = { kind: "file", file: searchResults.files[0]! } as const;

export const documentUploads: UploadItem[] = [
  { key: "u1", name: "Factuur Engie oktober 2026.pdf", sizeBytes: 120_000, mimeType: "application/pdf", status: "done", progress: 1 },
  { key: "u2", name: "Fluvius kwartierwaarden sep 2026.csv", sizeBytes: 290_000, mimeType: "text/csv", status: "uploading", progress: 0.62 },
  { key: "u3", name: "Plannen verdieping.pdf", sizeBytes: 9.2 * MB, mimeType: "application/pdf", status: "queued", progress: 0 },
  {
    key: "u4",
    name: "Drone video tuin.mov",
    sizeBytes: 640 * MB,
    mimeType: "video/quicktime",
    status: "error",
    progress: 0,
    error: "This file is too large.",
  },
];

/** A small inline picture, so the image preview has something to show without an API. */
export const meterstandImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#e8f2ec"/><rect x="170" y="130" width="300" height="160" rx="14" fill="#124734"/><text x="320" y="228" font-family="monospace" font-size="56" fill="#f4d7b5" text-anchor="middle">012 438,7</text><text x="320" y="330" font-family="sans-serif" font-size="22" fill="#124734" text-anchor="middle">kWh · dag</text></svg>`,
  );

export const fluviusCsvSample = [
  "Van datum;Van tijdstip;Tot datum;Tot tijdstip;EAN;Meter;Metertype;Register;Volume;Eenheid;Validatiestatus",
  '01-01-2025;00:00:00;01-01-2025;00:15:00;="541448820000000000";1SAG1100000000;Digitale Meter;Afname Nacht;0,123;kWh;Gevalideerd',
  '01-01-2025;00:00:00;01-01-2025;00:15:00;="541448820000000000";1SAG1100000000;Digitale Meter;Injectie Nacht;;kWh;Geen verbruik',
  '01-01-2025;00:15:00;01-01-2025;00:30:00;="541448820000000000";1SAG1100000000;Digitale Meter;Afname Nacht;0,118;kWh;Gevalideerd',
  '01-01-2025;00:15:00;01-01-2025;00:30:00;="541448820000000000";1SAG1100000000;Digitale Meter;Injectie Nacht;;kWh;Geen verbruik',
].join("\n");

/** Attachments of a bill: the invoice and the contract it refers to. */
export const billAttachments = [documentFiles.luminus, documentFiles.brandpolis];

export const searchFilesFixture = async (query: string) =>
  Object.values(documentFiles)
    .filter((value) => value.name.toLowerCase().includes(query.toLowerCase()))
    .map((value) => ({
      ...value,
      path: value.folderId
        ? pathTo(...allFolders.filter((candidate) => candidate.id === value.folderId))
        : [],
    }));
