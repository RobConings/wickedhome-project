import { z } from "zod";
import { hexColorSchema, idSchema } from "@/types/common";
import { canManageHousehold } from "@/types/roles";

// ── Entity links ────────────────────────────────────────────────────────────────────────────────────

/**
 * Kinds of items a document can be attached to. Adding a feature that wants attachments? Add its entity
 * type here and render `<DocumentAttachments entityType="…" entityId={id} />`.
 */
export const DOCUMENT_ENTITY_TYPES = [
  "bill",
  "subscription",
  "appliance",
  "task",
  "place",
  "product",
  "shopping_list",
  "shopping_item",
  "calendar_event",
  "habitant",
  "solar_installation",
  "home_battery",
  "energy_meter",
  /** A floor: the architect's plan imported as its underlay. */
  "floor",
  /** A project (quotes, receipts, inspiration photos; an image can be its cover). */
  "project",
  /** A recipe (photos, a scanned page; an image can be its cover). */
  "recipe",
] as const;
export const documentEntityTypeSchema = z.enum(DOCUMENT_ENTITY_TYPES);
export type DocumentEntityType = z.infer<typeof documentEntityTypeSchema>;

export const documentLinkSchema = z.object({
  entityType: documentEntityTypeSchema,
  entityId: idSchema,
});
export type DocumentLinkRef = z.infer<typeof documentLinkSchema>;

/** Body of `POST /api/documents/links`. */
export const documentLinkInputSchema = documentLinkSchema.extend({ fileId: idSchema });
export type DocumentLinkInput = z.infer<typeof documentLinkInputSchema>;

// ── Storage targets ─────────────────────────────────────────────────────────────────────────────────

/**
 * Kinds of documents a household can store somewhere else than the server (e.g. bills in a Google Drive
 * folder), recognised by the items they are attached to. Add a kind here (e.g. `manuals: ["appliance"]`)
 * and the integration offers it; the documents feature routes uploads and moves.
 */
export const STORAGE_TARGETS = {
  /** Files attached to expenses (one-off, recurring and their instances) and PDFs from mail suggestions. */
  bills: { entityTypes: ["bill"] },
} as const satisfies Record<string, { entityTypes: readonly DocumentEntityType[] }>;
export type StorageTargetKind = keyof typeof STORAGE_TARGETS;
export const STORAGE_TARGET_KINDS = Object.keys(STORAGE_TARGETS) as StorageTargetKind[];
export const storageTargetKindSchema = z.enum(STORAGE_TARGET_KINDS as [StorageTargetKind, ...StorageTargetKind[]]);

/** The storage target of a file attached to items of these entity types (the first kind that matches), or `null`. */
export function storageTargetOf(entityTypes: readonly string[]): StorageTargetKind | null {
  for (const kind of STORAGE_TARGET_KINDS) {
    const types: readonly string[] = STORAGE_TARGETS[kind].entityTypes;
    if (entityTypes.some((type) => types.includes(type))) return kind;
  }
  return null;
}

// ── Names, mime types ───────────────────────────────────────────────────────────────────────────────

/** Display names only; they never become a path. Still, no slashes or control characters. */
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^/\\\u0000-\u001f\u007f]+$/, { message: "No slashes or control characters" })
  .refine((name) => name !== "." && name !== "..", { message: "Not a valid name" });

/** `type/subtype`, lowercase, no parameters. */
export const mimeTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(127)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/);

/** Strips parameters (`; charset=utf-8`) and lowercases a Content-Type header. */
export const normalizeMimeType = (value: string | null | undefined) =>
  (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

export const FALLBACK_MIME_TYPE = "application/octet-stream";

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────────

/** Body of `POST /api/documents/folders`. */
export const folderCreateSchema = z.object({
  name: nameSchema,
  parentId: idSchema.nullish(),
  color: hexColorSchema.nullish(),
});
export type FolderCreateInput = z.infer<typeof folderCreateSchema>;

/** Body of `PATCH /api/documents/folders/:id`: rename, recolour and/or move (`parentId: null` = root). */
export const folderUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    color: hexColorSchema.nullish(),
    parentId: idSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>;

/** Body of `POST /api/documents/files`: registers a file, whose content is then PUT to `/files/:id/content`. */
export const fileCreateSchema = z.object({
  name: nameSchema,
  folderId: idSchema.nullish(),
  mimeType: mimeTypeSchema.default(FALLBACK_MIME_TYPE),
  sizeBytes: z.number().int().min(0),
  /** Attach the file to an item as soon as it is uploaded. */
  link: documentLinkSchema.optional(),
});
export type FileCreateInput = z.input<typeof fileCreateSchema>;

/** Body of `PATCH /api/documents/files/:id`: rename and/or move (`folderId: null` = root). */
export const fileUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    folderId: idSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type FileUpdateInput = z.infer<typeof fileUpdateSchema>;

/** Query of `GET /api/documents/contents`; no folder = the drive root. */
export const contentsQuerySchema = z.object({ folderId: idSchema.optional() });

/** Query of `GET /api/documents/search`. */
export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

// ── Output ──────────────────────────────────────────────────────────────────────────────────────────

export type DocumentFolder = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  /** Direct children that are not in the trash. */
  folderCount: number;
  fileCount: number;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DocumentFile = {
  id: string;
  name: string;
  folderId: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  storageProvider: "local" | "google_drive";
  /**
   * Stored on the server for now but waiting to move to its storage target (Drive was unavailable, or
   * "move existing" asked for it); a job retries. Absent or `null` when nothing is waiting.
   */
  pendingStorageTarget?: StorageTargetKind | null;
  uploadedBy: { id: string; name: string } | null;
  /** ISO timestamps. `uploadedAt` is null while the content is still uploading. */
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FolderCrumb = { id: string; name: string };

/** `GET /api/documents/contents`. */
export type FolderContents = {
  /** `null` = the drive root. */
  folder: DocumentFolder | null;
  /** From the top-level folder down to the parent of `folder` (the root itself is not included). */
  breadcrumbs: FolderCrumb[];
  folders: DocumentFolder[];
  files: DocumentFile[];
};

/** A search hit, with the path of the folder it is in. */
export type DocumentSearchResult = {
  folders: (DocumentFolder & { path: FolderCrumb[] })[];
  files: (DocumentFile & { path: FolderCrumb[] })[];
};

/** `GET /api/documents/trash`: only the items that were trashed themselves, not their contents. */
export type DocumentTrash = {
  folders: DocumentFolder[];
  files: DocumentFile[];
  /** Total bytes in the trash, including the contents of trashed folders. */
  totalBytes: number;
};

/** `GET /api/documents/usage`. */
export type StorageUsage = {
  /** Bytes of files in the drive (not in the trash). */
  usedBytes: number;
  fileCount: number;
  trashBytes: number;
  /** The disk the files are stored on; `null` when the server can't tell. */
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  maxUploadBytes: number;
};

// ── Rules shared by API and UI ──────────────────────────────────────────────────────────────────────

/** Owners and adults upload and organise documents; children can look and download. */
export const canManageDocuments = canManageHousehold;

export type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

/**
 * Types the browser may render inline (in an <img>, <iframe>, <video>). Everything else, notably HTML and
 * SVG which can run script, is always served as a download.
 */
const INLINE_TYPES: Record<string, PreviewKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/avif": "image",
  "application/pdf": "pdf",
  "video/mp4": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
};

/** Text we show in the preview by fetching it (never rendered as a page by the browser). */
const TEXT_TYPES = new Set(["text/plain", "text/csv", "text/markdown", "application/json"]);

export const isInlineSafeMimeType = (mimeType: string) => mimeType in INLINE_TYPES;

export function previewKind(mimeType: string): PreviewKind {
  return INLINE_TYPES[mimeType] ?? (TEXT_TYPES.has(mimeType) ? "text" : "none");
}

/** URL of a file's content; `download` forces a download instead of showing it in the browser. */
export const documentContentUrl = (id: string, { download = false } = {}) =>
  `/api/documents/files/${encodeURIComponent(id)}/content${download ? "?download=1" : ""}`;

/** `name`, or `name (2)`, `name (3)`… — the first that is not taken (case-insensitive). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((value) => value.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
