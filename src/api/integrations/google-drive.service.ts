import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { SessionUser } from "@/features/auth/types/auth";
import type { DriveFolderLink, DriveFolderListing, DriveImportInput, DriveItem } from "@/features/integrations/types/google";
import { createFile, maxUploadBytes, openFileContent, registerExternalFile, storeFileContent } from "../documents/documents.service";
import { setGoogleDriveBackend } from "../documents/storage/google-drive-storage-provider";
import { StorageNotFoundError, type ByteRange } from "../documents/storage/storage-provider";
import { db } from "../lib/db";
import { HttpError, badRequest, conflict, notFound } from "../lib/http";
import { parseTargetKey } from "./drive-storage-keys";
import { removeTargetFile } from "./drive-storage.service";
import { withGoogle, type ConnectionForAccess } from "./google-access";
import { GoogleApiError, assertOk, googleBytes, googleJson, googleRequest } from "./google-http";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,webViewLink,parents,trashed";
/** Google Docs, Sheets, Slides and Drawings are exported as PDF; other Google-native types only open in Drive. */
const EXPORTABLE = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing",
]);
/** How deep below a linked folder we look for a file's place (a file elsewhere in Drive is refused). */
const MAX_DEPTH = 25;

type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; parents?: string[]; trashed?: boolean };

const isNative = (mimeType: string) => mimeType.startsWith("application/vnd.google-apps.");

function toItem(file: DriveFile): DriveItem {
  const isFolder = file.mimeType === FOLDER;
  const native = isNative(file.mimeType);
  return {
    id: file.id,
    name: file.name,
    mimeType: native && EXPORTABLE.has(file.mimeType) ? "application/pdf" : file.mimeType,
    isFolder,
    sizeBytes: file.size ? Number(file.size) : null,
    modifiedAt: file.modifiedTime ?? null,
    webUrl: file.webViewLink?.startsWith("https://") ? file.webViewLink : null,
    downloadable: !isFolder && (!native || EXPORTABLE.has(file.mimeType)),
    linkable: !isFolder && !native,
  };
}

const getFile = (connection: ConnectionForAccess, id: string) =>
  withGoogle(connection, (accessToken) =>
    googleJson<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}&supportsAllDrives=true`, { accessToken }),
  );

async function listChildren(connection: ConnectionForAccess, parent: string, foldersOnly: boolean): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${API}/files`);
    // `parent` is validated (`[A-Za-z0-9_-]+` or "root"), so it can't break out of the query.
    url.searchParams.set("q", `'${parent}' in parents and trashed = false${foldersOnly ? ` and mimeType = '${FOLDER}'` : ""}`);
    url.searchParams.set("fields", `nextPageToken,files(${FILE_FIELDS})`);
    url.searchParams.set("orderBy", "folder,name_natural");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await withGoogle(connection, (accessToken) => googleJson<{ files?: DriveFile[]; nextPageToken?: string }>(url, { accessToken }));
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return files;
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────────────

const linkInclude = {
  connection: {
    select: { id: true, userId: true, refreshTokenEnc: true, status: true, googleAccountEmail: true, user: { select: { email: true, habitant: { select: { name: true } } } } },
  },
} as const;

type LinkRow = {
  id: string;
  name: string;
  driveFolderId: string;
  createdAt: Date;
  connection: ConnectionForAccess & { googleAccountEmail: string; user: { email: string; habitant: { name: string } | null } };
};

const toLink = (row: LinkRow, viewerId: string): DriveFolderLink => ({
  id: row.id,
  name: row.name,
  ownerName: row.connection.user.habitant?.name ?? row.connection.user.email,
  ownerEmail: row.connection.googleAccountEmail,
  mine: row.connection.userId === viewerId,
  available: row.connection.status === "CONNECTED",
  createdAt: row.createdAt.toISOString(),
});

export async function listDriveLinks(user: SessionUser): Promise<DriveFolderLink[]> {
  const rows = await db.googleDriveLink.findMany({ where: { householdId: user.householdId }, include: linkInclude, orderBy: { name: "asc" } });
  return rows.map((row) => toLink(row, user.id));
}

/** Folders of the person's own Drive, for the "link a folder" picker. */
export async function listOwnFolders(connection: ConnectionForAccess, parent: string): Promise<DriveItem[]> {
  return (await listChildren(connection, parent, true)).map(toItem);
}

export async function linkFolder(user: SessionUser, connection: ConnectionForAccess & { householdId: string }, driveFolderId: string): Promise<DriveFolderLink> {
  const folder = await getFile(connection, driveFolderId).catch((error: unknown) => {
    if (error instanceof GoogleApiError && error.status === 404) throw notFound("Folder not found in your Drive");
    throw error;
  });
  if (folder.mimeType !== FOLDER || folder.trashed) throw badRequest("That is not a folder");
  const row = await db.googleDriveLink.upsert({
    where: { connectionId_driveFolderId: { connectionId: connection.id, driveFolderId } },
    create: { householdId: connection.householdId, connectionId: connection.id, driveFolderId, name: folder.name.slice(0, 200) },
    update: { name: folder.name.slice(0, 200) },
    include: linkInclude,
  });
  return toLink(row, user.id);
}

/** Only the person who linked a folder unlinks it. Nothing in Drive changes. */
export async function unlinkFolder(user: SessionUser, id: string): Promise<void> {
  const row = await db.googleDriveLink.findFirst({ where: { id, householdId: user.householdId }, include: linkInclude });
  if (!row) throw notFound("Linked folder not found");
  if (row.connection.userId !== user.id) throw badRequest("Only the person who linked this folder can unlink it");
  await db.googleDriveLink.delete({ where: { id } });
}

async function findLink(householdId: string, id: string): Promise<LinkRow> {
  const row = await db.googleDriveLink.findFirst({ where: { id, householdId }, include: linkInclude });
  if (!row) throw notFound("Linked folder not found");
  if (row.connection.status !== "CONNECTED") throw conflict("The person who linked this folder needs to reconnect Google");
  return row;
}

/**
 * Where a Drive file sits below the linked folder: the folders in between (top first). Throws a 404 for anything
 * outside the linked folder, so a household member can't reach other files of the linker's Drive by id.
 */
async function pathBelowLink(link: LinkRow, fileId: string): Promise<{ file: DriveFile; path: DriveFile[] }> {
  const file = await getFile(link.connection, fileId).catch((error: unknown) => {
    if (error instanceof GoogleApiError && error.status === 404) throw notFound("File not found");
    throw error;
  });
  if (file.trashed) throw notFound("File not found");
  if (file.id === link.driveFolderId) return { file, path: [] };
  const path: DriveFile[] = [];
  let parentId = file.parents?.[0];
  for (let depth = 0; parentId && depth < MAX_DEPTH; depth++) {
    if (parentId === link.driveFolderId) return { file, path: path.reverse() };
    const parent = await getFile(link.connection, parentId);
    path.push(parent);
    parentId = parent.parents?.[0];
  }
  throw notFound("File not found");
}

export async function listLinkedFolder(user: SessionUser, linkId: string, folderId?: string): Promise<DriveFolderListing> {
  const link = await findLink(user.householdId, linkId);
  const target = folderId ?? link.driveFolderId;
  const { file, path } = await pathBelowLink(link, target);
  if (file.mimeType !== FOLDER) throw badRequest("That is not a folder");
  const breadcrumbs = target === link.driveFolderId ? [] : [...path, file].map((entry) => ({ id: entry.id, name: entry.name }));
  const items = (await listChildren(link.connection, target, false)).map(toItem);
  return { link: toLink(link, user.id), breadcrumbs, folderId: target, items };
}

// ── Content ──────────────────────────────────────────────────────────────────────────────────────────

/** Opens a file's bytes from Drive (Google Docs exported as PDF). `range` only for real files. */
async function openDriveContent(connection: ConnectionForAccess, file: DriveFile, range?: ByteRange): Promise<Response> {
  const native = isNative(file.mimeType);
  const url = native
    ? `${API}/files/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf`
    : `${API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
  const response = await withGoogle(connection, async (accessToken) => {
    const answer = await googleRequest(url, {
      accessToken,
      timeoutMs: 120_000,
      headers: { Accept: "*/*", ...(range && !native && { Range: `bytes=${range.start}-${range.end}` }) },
    });
    await assertOk(answer, url);
    return answer;
  });
  return response;
}

const toNodeStream = (response: Response) =>
  response.body ? Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>) : Readable.from([]);

/** For `GET …/links/:id/files/:fileId/content`: the checked file and its stream. */
export async function openLinkedFile(user: SessionUser, linkId: string, fileId: string) {
  const link = await findLink(user.householdId, linkId);
  const { file } = await pathBelowLink(link, fileId);
  const item = toItem(file);
  if (!item.downloadable) throw badRequest("This file can only be opened in Google Drive");
  const response = await openDriveContent(link.connection, file);
  const length = response.headers.get("content-length");
  return { item, stream: toNodeStream(response), sizeBytes: length ? Number(length) : null };
}

/** Imports a file of a linked folder into Documents: a local copy (default) or a link whose bytes stay in Drive. */
export async function importLinkedFile(user: SessionUser, linkId: string, input: DriveImportInput): Promise<{ documentId: string }> {
  const link = await findLink(user.householdId, linkId);
  const { file } = await pathBelowLink(link, input.fileId);
  const item = toItem(file);
  if (!item.downloadable) throw badRequest("This file can only be opened in Google Drive");
  const name = isNative(file.mimeType) && !/\.pdf$/i.test(file.name) ? `${file.name}.pdf` : file.name;

  if (input.keep === "drive") {
    if (!item.linkable || item.sizeBytes === null) throw badRequest("Google Docs can only be imported as a copy");
    if (item.sizeBytes > 2_000_000_000) throw new HttpError(413, "too_large", "This file is too large to add");
    const document = await registerExternalFile(user, {
      name,
      folderId: input.folderId,
      mimeType: file.mimeType,
      sizeBytes: item.sizeBytes,
      storageProvider: "GOOGLE_DRIVE",
      storageKey: `gdrive:${link.connection.id}:${file.id}`,
      externalId: file.id,
    });
    return { documentId: document.id };
  }

  const limit = maxUploadBytes();
  if (item.sizeBytes !== null && item.sizeBytes > limit) throw new HttpError(413, "too_large", "This file is larger than the upload limit");
  const url = isNative(file.mimeType)
    ? `${API}/files/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf`
    : `${API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
  const { bytes } = await withGoogle(link.connection, (accessToken) =>
    googleBytes(url, { accessToken, maxBytes: limit, timeoutMs: 180_000, headers: { Accept: "*/*" } }),
  );
  const created = await createFile(user, { name, folderId: input.folderId ?? null, mimeType: item.mimeType, sizeBytes: bytes.length });
  await storeFileContent(user.householdId, created.id, Readable.from(bytes), { contentType: item.mimeType, contentLength: String(bytes.length) });
  return { documentId: created.id };
}

// ── Save to Drive ────────────────────────────────────────────────────────────────────────────────────

/** The "WickedHome" folder the app created in the person's Drive (drive.file only sees what the app made). */
async function appFolder(connection: ConnectionForAccess & { driveAppFolderId: string | null }): Promise<string> {
  if (connection.driveAppFolderId) {
    try {
      const folder = await getFile(connection, connection.driveAppFolderId);
      if (!folder.trashed) return folder.id;
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
    }
  }
  const created = await withGoogle(connection, (accessToken) =>
    googleJson<{ id: string }>(`${API}/files?fields=id`, {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "WickedHome", mimeType: FOLDER }),
    }),
  );
  await db.googleConnection.update({ where: { id: connection.id }, data: { driveAppFolderId: created.id } });
  return created.id;
}

/** Copies one of the household's documents into the person's Drive (folder "WickedHome"). Local stays as it is. */
export async function saveToDrive(
  user: SessionUser,
  connection: ConnectionForAccess & { driveAppFolderId: string | null },
  documentId: string,
): Promise<{ webUrl: string | null }> {
  const { file, open } = await openFileContent(user.householdId, documentId);
  if (file.storageProvider === "google_drive") throw badRequest("This document is already stored in Drive");
  if (file.sizeBytes > maxUploadBytes()) throw new HttpError(413, "too_large", "This file is too large");
  const chunks: Buffer[] = [];
  for await (const chunk of await open()) chunks.push(Buffer.from(chunk as Uint8Array));
  const bytes = Buffer.concat(chunks);
  const parent = await appFolder(connection);

  // Resumable upload: metadata first, then the bytes to the session URL Google returns (same host).
  const session = await withGoogle(connection, async (accessToken) => {
    const url = `${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`;
    const response = await googleRequest(url, {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": file.mimeType, "X-Upload-Content-Length": String(bytes.length) },
      body: JSON.stringify({ name: file.name, parents: [parent] }),
    });
    await assertOk(response, url);
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) throw new GoogleApiError("Drive didn't start the upload");
    return { location, accessToken };
  });
  const uploaded = await googleJson<{ id: string; webViewLink?: string }>(session.location, {
    method: "PUT",
    accessToken: session.accessToken,
    timeoutMs: 300_000,
    headers: { "Content-Type": file.mimeType },
    body: bytes,
  });
  return { webUrl: uploaded.webViewLink?.startsWith("https://") ? uploaded.webViewLink : null };
}

// ── Storage backend for documents stored in Drive ────────────────────────────────────────────────────

/** Linked files: `gdrive:<connectionId>:<fileId>`; storage-target files: `gdrive-target:<kind>:<userId>:<fileId>`. */
function parseKey(key: string): { where: { id: string } | { userId: string }; fileId: string } {
  const target = parseTargetKey(key);
  if (target) return { where: { userId: target.userId }, fileId: target.fileId };
  const match = /^gdrive:([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{1,200})$/.exec(key);
  if (!match?.[1] || !match[2]) throw new StorageNotFoundError(key);
  return { where: { id: match[1] }, fileId: match[2] };
}

async function backendConnection(key: string) {
  const { where, fileId } = parseKey(key);
  const connection = await db.googleConnection.findUnique({ where, select: { id: true, userId: true, refreshTokenEnc: true, status: true } });
  if (!connection || connection.status !== "CONNECTED") throw new StorageNotFoundError(key);
  return { connection, fileId };
}

setGoogleDriveBackend({
  remove: removeTargetFile,
  async open(key, range) {
    const { connection, fileId } = await backendConnection(key);
    try {
      const file = await getFile(connection, fileId);
      return toNodeStream(await openDriveContent(connection, file, range));
    } catch (error) {
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 403)) throw new StorageNotFoundError(key);
      throw error;
    }
  },
  async stat(key) {
    try {
      const { connection, fileId } = await backendConnection(key);
      const file = await getFile(connection, fileId);
      return file.trashed || !file.size ? null : { sizeBytes: Number(file.size) };
    } catch {
      return null;
    }
  },
});
