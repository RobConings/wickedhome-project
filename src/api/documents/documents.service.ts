import { statfs } from "node:fs/promises";
import type { Readable } from "node:stream";
import type { SessionUser } from "@/features/auth/types/auth";
import {
  STORAGE_TARGET_KINDS,
  normalizeMimeType,
  uniqueName,
  type StorageTargetKind,
  type DocumentEntityType,
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
  type FolderCrumb,
  type FolderUpdateInput,
  type StorageUsage,
} from "@/features/documents/types/documents";
import { config } from "../lib/config";
import { db, type Prisma } from "../lib/db";
import { HttpError, badRequest, conflict, notFound } from "../lib/http";
import { queueAttachedFile, routeNewUpload } from "./document-targets.service";
import { storageProvider, localStorageRoot } from "./storage/storage";
import { StorageLimitError, type ByteRange } from "./storage/storage-provider";

/** Decimal megabytes, like the sizes the UI shows. */
export const maxUploadBytes = () => config.MAX_UPLOAD_MB * 1_000_000;

/** Pending uploads older than this are abandoned and cleaned up (daily job `documents.abandoned-uploads`). */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 50;

// ── Mapping ─────────────────────────────────────────────────────────────────────────────────────────

const folderInclude = {
  _count: {
    select: {
      children: { where: { deletedAt: null } },
      files: { where: { deletedAt: null, uploadedAt: { not: null } } },
    },
  },
} satisfies Prisma.DocumentFolderInclude;

const fileInclude = {
  uploadedBy: { select: { id: true, email: true, habitant: { select: { name: true } } } },
} satisfies Prisma.DocumentFileInclude;

type FolderRow = Prisma.DocumentFolderGetPayload<{ include: typeof folderInclude }>;
type FileRow = Prisma.DocumentFileGetPayload<{ include: typeof fileInclude }>;

const iso = (date: Date | null) => date?.toISOString() ?? null;
const isTargetKind = (value: string | null): value is StorageTargetKind =>
  value !== null && (STORAGE_TARGET_KINDS as string[]).includes(value);

function toFolder(row: FolderRow): DocumentFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    color: row.color,
    folderCount: row._count.children,
    fileCount: row._count.files,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt),
  };
}

function toFile(row: FileRow): DocumentFile {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folderId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    storageProvider: row.storageProvider === "GOOGLE_DRIVE" ? "google_drive" : "local",
    pendingStorageTarget: row.storageProvider === "LOCAL" && isTargetKind(row.pendingTarget) ? row.pendingTarget : null,
    uploadedBy: row.uploadedBy
      ? { id: row.uploadedBy.id, name: row.uploadedBy.habitant?.name ?? row.uploadedBy.email }
      : null,
    uploadedAt: iso(row.uploadedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt),
  };
}

// ── Folder tree helpers (a household has hundreds of folders at most: load them once, walk in memory) ─

type TreeNode = { id: string; name: string; parentId: string | null; deletedAt: Date | null };

async function loadTree(householdId: string) {
  const nodes = await db.documentFolder.findMany({
    where: { householdId },
    select: { id: true, name: true, parentId: true, deletedAt: true },
  });
  return new Map<string, TreeNode>(nodes.map((node) => [node.id, node]));
}

/** Ancestors of `folderId`, top-level first, excluding the folder itself. */
function ancestors(tree: Map<string, TreeNode>, folderId: string | null): FolderCrumb[] {
  const path: FolderCrumb[] = [];
  const seen = new Set<string>();
  let current = folderId ? tree.get(folderId)?.parentId : null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = tree.get(current);
    if (!node) break;
    path.unshift({ id: node.id, name: node.name });
    current = node.parentId;
  }
  return path;
}

/** `folderId` and every folder below it. */
function subtree(tree: Map<string, TreeNode>, folderId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of tree.values()) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  }
  const result: string[] = [];
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift() as string;
    if (result.includes(id)) continue;
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

const pathOf = (tree: Map<string, TreeNode>, folderId: string | null) => {
  if (!folderId) return [];
  const node = tree.get(folderId);
  return node ? [...ancestors(tree, folderId), { id: node.id, name: node.name }] : [];
};

// ── Lookups (another household's id is a 404) ──────────────────────────────────────────────────────

async function findActiveFolder(householdId: string, id: string) {
  const row = await db.documentFolder.findFirst({ where: { id, householdId, deletedAt: null }, include: folderInclude });
  if (!row) throw notFound("Folder not found");
  return row;
}

/** `null`/`undefined` is the root and always exists. */
async function assertActiveFolder(householdId: string, id: string | null | undefined) {
  if (id) await findActiveFolder(householdId, id);
}

async function findFile(householdId: string, id: string, where: Prisma.DocumentFileWhereInput = {}) {
  const row = await db.documentFile.findFirst({ where: { id, householdId, ...where }, include: fileInclude });
  if (!row) throw notFound("File not found");
  return row;
}

const activeFiles = { deletedAt: null, uploadedAt: { not: null } } satisfies Prisma.DocumentFileWhereInput;

async function assertFolderNameFree(householdId: string, parentId: string | null, name: string, exceptId?: string) {
  const taken = await db.documentFolder.findFirst({
    where: {
      householdId,
      parentId,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (taken) throw conflict("A folder with this name already exists here");
}

// ── Browsing ────────────────────────────────────────────────────────────────────────────────────────

export async function getContents(householdId: string, folderId?: string): Promise<FolderContents> {
  const folder = folderId ? await findActiveFolder(householdId, folderId) : null;
  const parentId = folder?.id ?? null;
  const [folders, files, tree] = await Promise.all([
    db.documentFolder.findMany({
      where: { householdId, parentId, deletedAt: null },
      include: folderInclude,
      orderBy: { name: "asc" },
    }),
    db.documentFile.findMany({
      where: { householdId, folderId: parentId, ...activeFiles },
      include: fileInclude,
      orderBy: { name: "asc" },
    }),
    folder ? loadTree(householdId) : Promise.resolve(new Map<string, TreeNode>()),
  ]);
  return {
    folder: folder && toFolder(folder),
    breadcrumbs: ancestors(tree, parentId),
    folders: folders.map(toFolder),
    files: files.map(toFile),
  };
}

/** Every folder not in the trash, for the move dialog's tree. */
export async function listFolders(householdId: string): Promise<DocumentFolder[]> {
  const rows = await db.documentFolder.findMany({
    where: { householdId, deletedAt: null },
    include: folderInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toFolder);
}

export async function getFile(householdId: string, id: string): Promise<DocumentFile> {
  return toFile(await findFile(householdId, id));
}

export async function search(householdId: string, q: string): Promise<DocumentSearchResult> {
  const name = { contains: q, mode: "insensitive" as const };
  const [folders, files, tree] = await Promise.all([
    db.documentFolder.findMany({
      where: { householdId, deletedAt: null, name },
      include: folderInclude,
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    }),
    db.documentFile.findMany({
      where: { householdId, ...activeFiles, name },
      include: fileInclude,
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    }),
    loadTree(householdId),
  ]);
  return {
    folders: folders.map((row) => ({ ...toFolder(row), path: ancestors(tree, row.id) })),
    files: files.map((row) => ({ ...toFile(row), path: pathOf(tree, row.folderId) })),
  };
}

// ── Folders ─────────────────────────────────────────────────────────────────────────────────────────

export async function createFolder(householdId: string, input: FolderCreateInput): Promise<DocumentFolder> {
  const parentId = input.parentId ?? null;
  await assertActiveFolder(householdId, parentId);
  await assertFolderNameFree(householdId, parentId, input.name);
  const row = await db.documentFolder.create({
    data: { householdId, parentId, name: input.name, color: input.color ?? null },
    include: folderInclude,
  });
  return toFolder(row);
}

export async function updateFolder(householdId: string, id: string, input: FolderUpdateInput): Promise<DocumentFolder> {
  const folder = await findActiveFolder(householdId, id);
  const parentId = input.parentId === undefined ? folder.parentId : input.parentId;

  if (parentId !== folder.parentId && parentId) {
    await assertActiveFolder(householdId, parentId);
    if (subtree(await loadTree(householdId), id).includes(parentId)) {
      throw badRequest("A folder can't be moved into itself", { parentId: ["Can't move a folder into itself"] });
    }
  }
  const name = input.name ?? folder.name;
  if (name !== folder.name || parentId !== folder.parentId) await assertFolderNameFree(householdId, parentId, name, id);

  const row = await db.documentFolder.update({
    where: { id },
    data: { name, parentId, ...(input.color !== undefined && { color: input.color }) },
    include: folderInclude,
  });
  return toFolder(row);
}

/** Moves the folder and everything in it to the trash, stamped with one instant so it restores together. */
export async function trashFolder(householdId: string, id: string): Promise<void> {
  await findActiveFolder(householdId, id);
  const ids = subtree(await loadTree(householdId), id);
  const deletedAt = new Date();
  await db.$transaction([
    db.documentFolder.updateMany({ where: { householdId, id: { in: ids }, deletedAt: null }, data: { deletedAt } }),
    db.documentFile.updateMany({ where: { householdId, folderId: { in: ids }, deletedAt: null }, data: { deletedAt } }),
  ]);
}

/** Restores a folder from the trash, with everything that was trashed together with it. */
export async function restoreFolder(householdId: string, id: string): Promise<DocumentFolder> {
  const folder = await db.documentFolder.findFirst({ where: { id, householdId, deletedAt: { not: null } } });
  if (!folder?.deletedAt) throw notFound("Folder not found in the trash");
  const tree = await loadTree(householdId);
  const parent = folder.parentId ? tree.get(folder.parentId) : undefined;
  if (parent?.deletedAt) throw conflict("Restore the folder it was in first");

  const siblings = [...tree.values()].filter(
    (node) => node.parentId === folder.parentId && !node.deletedAt && node.id !== id,
  );
  const name = uniqueName(folder.name, siblings.map((node) => node.name));
  const ids = subtree(tree, id);
  await db.$transaction([
    db.documentFolder.updateMany({
      where: { householdId, id: { in: ids }, deletedAt: folder.deletedAt },
      data: { deletedAt: null },
    }),
    db.documentFolder.update({ where: { id }, data: { name, deletedAt: null } }),
    db.documentFile.updateMany({
      where: { householdId, folderId: { in: ids }, deletedAt: folder.deletedAt },
      data: { deletedAt: null },
    }),
  ]);
  return toFolder(await findActiveFolder(householdId, id));
}

/** Deletes a trashed folder, everything below it, and the stored bytes. */
export async function deleteFolderPermanently(householdId: string, id: string): Promise<void> {
  const folder = await db.documentFolder.findFirst({ where: { id, householdId, deletedAt: { not: null } } });
  if (!folder) throw notFound("Folder not found in the trash");
  const ids = subtree(await loadTree(householdId), id);
  const files = await db.documentFile.findMany({ where: { householdId, folderId: { in: ids } } });
  await removeFiles(files);
  await db.documentFolder.delete({ where: { id } });
}

// ── Files ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Housekeeping (daily job `documents.abandoned-uploads`, all households): files registered more than a day
 * ago whose content never arrived. They have no stored bytes yet, so only the row goes. Returns the count.
 */
export async function removeAbandonedUploads(now = new Date()): Promise<number> {
  const { count } = await db.documentFile.deleteMany({
    where: { uploadedAt: null, createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } },
  });
  return count;
}

/** Registers a file. Its content must follow with `storeFileContent`; until then it is invisible. */
export async function createFile(user: SessionUser, input: FileCreateInput & { mimeType: string }): Promise<DocumentFile> {
  const { householdId } = user;
  if (input.sizeBytes > maxUploadBytes()) {
    throw new HttpError(413, "too_large", `Files can be at most ${config.MAX_UPLOAD_MB} MB`);
  }
  await assertActiveFolder(householdId, input.folderId);

  const row = await db.documentFile.create({
    data: {
      householdId,
      folderId: input.folderId ?? null,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById: user.id,
      ...(input.link && {
        links: { create: { householdId, entityType: input.link.entityType, entityId: input.link.entityId } },
      }),
    },
    include: fileInclude,
  });
  return toFile(row);
}

/**
 * Streams the request body of `PUT /files/:id/content` into storage. The declared Content-Type must match
 * the registered type, and the body must be exactly the registered size: the stream is cut off as soon as
 * it exceeds it, so the max upload size is enforced while streaming, not after.
 */
export async function storeFileContent(
  householdId: string,
  id: string,
  body: Readable,
  headers: { contentType: string | undefined; contentLength: string | undefined },
): Promise<DocumentFile> {
  const file = await findFile(householdId, id, { deletedAt: null });
  if (file.uploadedAt) throw conflict("This file's content was already uploaded");
  if (normalizeMimeType(headers.contentType) !== file.mimeType) {
    throw new HttpError(415, "unsupported_media_type", `Content-Type must be ${file.mimeType}`);
  }
  if (headers.contentLength !== undefined && Number(headers.contentLength) !== file.sizeBytes) {
    throw badRequest(`Content-Length must be ${file.sizeBytes}`);
  }

  const provider = storageProvider();
  let stored;
  try {
    stored = await provider.put(body, { householdId, maxBytes: Math.min(file.sizeBytes, maxUploadBytes()) });
  } catch (error) {
    if (error instanceof StorageLimitError) {
      throw new HttpError(413, "too_large", "The upload is larger than the registered size");
    }
    throw error;
  }
  if (stored.sizeBytes !== file.sizeBytes) {
    await provider.delete(stored.key);
    throw badRequest("The upload is smaller than the registered size");
  }

  // `uploadedAt: null` guards against two uploads racing for the same row.
  const { count } = await db.documentFile.updateMany({
    where: { id, householdId, uploadedAt: null },
    data: {
      storageProvider: provider.name,
      storageKey: stored.key,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      uploadedAt: new Date(),
    },
  });
  if (count === 0) {
    await provider.delete(stored.key);
    throw conflict("This file's content was already uploaded");
  }
  // Bill documents (and other storage-target kinds) move to their target now; never fails the upload.
  await routeNewUpload(householdId, id);
  return getFile(householdId, id);
}

/**
 * Adds a file whose bytes stay at an external provider (a Google Drive file added from a linked folder). The
 * caller (the integrations feature) checked access and gives the provider key; nothing is stored locally.
 */
export async function registerExternalFile(
  user: SessionUser,
  input: { name: string; folderId?: string | null; mimeType: string; sizeBytes: number; storageProvider: "GOOGLE_DRIVE"; storageKey: string; externalId: string },
): Promise<DocumentFile> {
  await assertActiveFolder(user.householdId, input.folderId);
  const row = await db.documentFile.create({
    data: {
      householdId: user.householdId,
      folderId: input.folderId ?? null,
      name: input.name,
      mimeType: normalizeMimeType(input.mimeType) || "application/octet-stream",
      sizeBytes: input.sizeBytes,
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      externalId: input.externalId,
      uploadedById: user.id,
      uploadedAt: new Date(),
    },
    include: fileInclude,
  });
  return toFile(row);
}

/** Opens a file's content for download. Trashed files can still be downloaded (to check before restoring). */
export async function openFileContent(householdId: string, id: string) {
  const file = await findFile(householdId, id, { uploadedAt: { not: null } });
  if (!file.storageKey) throw notFound("File not found");
  const provider = storageProvider(file.storageProvider);
  const key = file.storageKey;
  return {
    file: toFile(file),
    open: (range?: ByteRange) => provider.get(key, range),
  };
}

export async function updateFile(householdId: string, id: string, input: FileUpdateInput): Promise<DocumentFile> {
  await findFile(householdId, id, activeFiles);
  if (input.folderId !== undefined) await assertActiveFolder(householdId, input.folderId);
  const row = await db.documentFile.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.folderId !== undefined && { folderId: input.folderId }),
    },
    include: fileInclude,
  });
  return toFile(row);
}

export async function trashFile(householdId: string, id: string): Promise<void> {
  await findFile(householdId, id, activeFiles);
  await db.documentFile.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreFile(householdId: string, id: string): Promise<DocumentFile> {
  const file = await findFile(householdId, id, { deletedAt: { not: null } });
  if (file.folderId) {
    const folder = await db.documentFolder.findFirst({ where: { id: file.folderId, householdId } });
    if (folder?.deletedAt) throw conflict("Restore the folder it was in first");
  }
  const row = await db.documentFile.update({ where: { id }, data: { deletedAt: null }, include: fileInclude });
  return toFile(row);
}

export async function deleteFilePermanently(householdId: string, id: string): Promise<void> {
  const file = await findFile(householdId, id, { deletedAt: { not: null } });
  await removeFiles([file]);
}

/** Deletes the stored bytes first, then the rows. A missing object on disk is fine (idempotent). */
async function removeFiles(files: { id: string; storageKey: string | null; storageProvider: "LOCAL" | "GOOGLE_DRIVE" }[]) {
  for (const file of files) {
    if (file.storageKey) await storageProvider(file.storageProvider).delete(file.storageKey);
  }
  if (files.length) await db.documentFile.deleteMany({ where: { id: { in: files.map((file) => file.id) } } });
}

// ── Trash ───────────────────────────────────────────────────────────────────────────────────────────

/** Items trashed by themselves; the contents of a trashed folder come back with it and are not listed. */
export async function listTrash(householdId: string): Promise<DocumentTrash> {
  const [folders, files, total] = await Promise.all([
    db.documentFolder.findMany({
      where: {
        householdId,
        deletedAt: { not: null },
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      },
      include: folderInclude,
      orderBy: { deletedAt: "desc" },
    }),
    db.documentFile.findMany({
      where: {
        householdId,
        uploadedAt: { not: null },
        deletedAt: { not: null },
        OR: [{ folderId: null }, { folder: { deletedAt: null } }],
      },
      include: fileInclude,
      orderBy: { deletedAt: "desc" },
    }),
    db.documentFile.aggregate({
      where: { householdId, uploadedAt: { not: null }, deletedAt: { not: null } },
      _sum: { sizeBytes: true },
    }),
  ]);
  return { folders: folders.map(toFolder), files: files.map(toFile), totalBytes: total._sum.sizeBytes ?? 0 };
}

export async function emptyTrash(householdId: string): Promise<void> {
  const files = await db.documentFile.findMany({ where: { householdId, deletedAt: { not: null } } });
  await removeFiles(files);
  // Trashed folders may still hold files trashed with them; those were removed above. Delete the top
  // ones; the database cascades to trashed subfolders.
  await db.documentFolder.deleteMany({ where: { householdId, deletedAt: { not: null } } });
}

export async function getUsage(householdId: string): Promise<StorageUsage> {
  const [used, trash, disk] = await Promise.all([
    db.documentFile.aggregate({
      where: { householdId, ...activeFiles },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    db.documentFile.aggregate({
      where: { householdId, uploadedAt: { not: null }, deletedAt: { not: null } },
      _sum: { sizeBytes: true },
    }),
    statfs(localStorageRoot()).catch(() => null),
  ]);
  return {
    usedBytes: used._sum.sizeBytes ?? 0,
    fileCount: used._count._all,
    trashBytes: trash._sum.sizeBytes ?? 0,
    diskTotalBytes: disk ? disk.blocks * disk.bsize : null,
    diskFreeBytes: disk ? disk.bavail * disk.bsize : null,
    maxUploadBytes: maxUploadBytes(),
  };
}

// ── Links ───────────────────────────────────────────────────────────────────────────────────────────

/** Documents attached to one item, newest first. Trashed and pending files are left out. */
export async function listLinkedFiles(householdId: string, { entityType, entityId }: DocumentLinkRef) {
  const rows = await db.documentFile.findMany({
    where: { householdId, ...activeFiles, links: { some: { entityType, entityId } } },
    include: fileInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toFile);
}

/** Idempotent. The item itself is not checked: like favourites, links are generic. */
export async function attachFile(householdId: string, { fileId, entityType, entityId }: DocumentLinkInput) {
  await findFile(householdId, fileId, activeFiles);
  await db.documentLink.upsert({
    where: { fileId_entityType_entityId: { fileId, entityType, entityId } },
    create: { householdId, fileId, entityType, entityId },
    update: {},
  });
  // A local file attached to an expense becomes a bill document: queue it for the bills target, if any.
  await queueAttachedFile(householdId, fileId, entityType);
}

export async function detachFile(householdId: string, { fileId, entityType, entityId }: DocumentLinkInput) {
  await db.documentLink.deleteMany({ where: { householdId, fileId, entityType, entityId } });
}

/**
 * Removes all links to an item (or to several, e.g. the instances a series delete removed). Other features
 * call this when they delete the item. The files themselves stay in the drive.
 */
export async function forgetDocumentLinks(entityType: DocumentEntityType, entityId: string | string[]): Promise<void> {
  const ids = Array.isArray(entityId) ? entityId : [entityId];
  if (ids.length === 0) return;
  await db.documentLink.deleteMany({ where: { entityType, entityId: { in: ids } } });
}

/**
 * Re-points links from one item to another of the same type, for features that replace an item by a new
 * row (a bill series regenerating its open instances). `to` must be a fresh item without links of its own.
 */
export async function moveDocumentLinks(entityType: DocumentEntityType, moves: { from: string; to: string }[]): Promise<void> {
  if (moves.length === 0) return;
  await db.$transaction(
    moves.map(({ from, to }) => db.documentLink.updateMany({ where: { entityType, entityId: from }, data: { entityId: to } })),
  );
}
