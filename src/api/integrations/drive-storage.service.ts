import type { SessionUser } from "@/features/auth/types/auth";
import { STORAGE_TARGET_KINDS, type StorageTargetKind } from "@/features/documents/types/documents";
import {
  featureForFolderMode,
  type DriveStorageSetupInput,
  type DriveStorageStatus,
  type DriveStorageTarget,
  type DriveStorageUpdateInput,
} from "@/features/integrations/types/drive-storage";
import { featuresFromScopes } from "@/features/integrations/types/google";
import { forgetPendingFiles, queueExistingFiles, storageTargetCounts } from "../documents/document-targets.service";
import { setStorageTargetHandler, StorageTargetUnavailableError, type StorageTargetHandler } from "../documents/storage/storage-targets";
import { db, type Prisma } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";
import { parseTargetKey, targetKey } from "./drive-storage-keys";
import { handlerState, resolveTargetState, yearOf } from "./drive-storage-state";
import { uploadToDrive } from "./drive-upload";
import { errorText, googleClientConfig, withGoogle, type ConnectionForAccess } from "./google-access";
import { requireConnection } from "./google-connection.service";
import { GoogleApiError, googleJson } from "./google-http";

/*
 * Google Drive as a storage target (docs/INTEGRATIONS.md "Drive as storage for bill documents"). The household
 * picks a folder in one person's Drive per kind (bills…); uploads of that kind are copied there, verified, and
 * then served from Drive through the server. The documents feature decides what moves and when
 * (document-targets.service.ts); this file only knows Drive.
 */

const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

type TargetRow = Prisma.GoogleDriveStorageTargetGetPayload<{ include: { user: { select: { email: true; habitant: { select: { name: true } } } } } }>;
type ConnectionRow = ConnectionForAccess & { scopes: string[]; googleAccountEmail: string };

const connectionSelect = { id: true, userId: true, refreshTokenEnc: true, status: true, scopes: true, googleAccountEmail: true } as const;
const targetInclude = { user: { select: { email: true, habitant: { select: { name: true } } } } } as const;

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

// ── Lookups ──────────────────────────────────────────────────────────────────────────────────────────

const findTarget = (householdId: string, kind: StorageTargetKind) =>
  db.googleDriveStorageTarget.findUnique({ where: { householdId_kind: { householdId, kind } }, include: targetInclude });

const connectionOf = (userId: string): Promise<ConnectionRow | null> =>
  db.googleConnection.findUnique({ where: { userId }, select: connectionSelect });

async function usableTarget(householdId: string, kind: StorageTargetKind): Promise<{ target: TargetRow; connection: ConnectionRow }> {
  const target = await findTarget(householdId, kind);
  const connection = target ? await connectionOf(target.userId) : null;
  const resolved = resolveTargetState(target, connection, googleClientConfig() !== null);
  if (!target || !connection || resolved.state !== "active") throw new StorageTargetUnavailableError("Google Drive is not available for this right now");
  return { target, connection };
}

// ── Drive folders ────────────────────────────────────────────────────────────────────────────────────

type DriveFolder = { id: string; name: string; mimeType: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } };

const getFolder = (connection: ConnectionForAccess, id: string) =>
  withGoogle(connection, (accessToken) =>
    googleJson<DriveFolder>(`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`, { accessToken }),
  );

const createFolder = (connection: ConnectionForAccess, name: string, parentId?: string) =>
  withGoogle(connection, (accessToken) =>
    googleJson<{ id: string; name: string }>(`${API}/files?fields=id,name&supportsAllDrives=true`, {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId && { parents: [parentId] }) }),
    }),
  );

async function findChildFolder(connection: ConnectionForAccess, parentId: string, name: string): Promise<string | null> {
  const url = new URL(`${API}/files`);
  // Both values are ours: a validated Drive id and a 4-digit year.
  url.searchParams.set("q", `'${parentId}' in parents and name = '${name}' and mimeType = '${FOLDER}' and trashed = false`);
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const body = await withGoogle(connection, (accessToken) => googleJson<{ files?: { id: string }[] }>(url, { accessToken }));
  return body.files?.[0]?.id ?? null;
}

/** One year folder at a time per target, so two uploads don't create "2026" twice. */
const yearFolderRuns = new Map<string, Promise<string>>();

async function folderFor(target: TargetRow, connection: ConnectionForAccess, uploadedAt: Date): Promise<string> {
  if (!target.yearSubfolders) return target.driveFolderId;
  const year = yearOf(uploadedAt);
  const cache = (target.yearFolders ?? {}) as Record<string, string>;
  if (cache[year]) return cache[year];
  const runKey = `${target.id}:${year}`;
  const running = yearFolderRuns.get(runKey);
  if (running) return running;
  const run = (async () => {
    const id = (await findChildFolder(connection, target.driveFolderId, year)) ?? (await createFolder(connection, year, target.driveFolderId)).id;
    const fresh = await db.googleDriveStorageTarget.findUnique({ where: { id: target.id }, select: { yearFolders: true } });
    await db.googleDriveStorageTarget.update({
      where: { id: target.id },
      data: { yearFolders: { ...((fresh?.yearFolders ?? {}) as Record<string, string>), [year]: id } },
    });
    return id;
  })().finally(() => yearFolderRuns.delete(runKey));
  yearFolderRuns.set(runKey, run);
  return run;
}

async function forgetYearFolders(targetId: string) {
  await db.googleDriveStorageTarget.update({ where: { id: targetId }, data: { yearFolders: {} } });
}

// ── The storage target handler (registered with documents) ───────────────────────────────────────────

const driveTargetHandler: StorageTargetHandler = {
  async state(householdId, kind) {
    const target = await findTarget(householdId, kind);
    if (!target) return "off";
    return handlerState(resolveTargetState(target, await connectionOf(target.userId), googleClientConfig() !== null));
  },

  async upload(householdId, kind, file, signal) {
    const { target, connection } = await usableTarget(householdId, kind);
    const send = async (parentId: string) =>
      uploadToDrive(connection, { name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, parentId, open: file.open, signal });
    let uploaded;
    try {
      uploaded = await send(await folderFor(target, connection, file.uploadedAt));
    } catch (error) {
      if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
      // A year folder removed in Drive: find or make it again, once. The chosen folder itself gone: say so.
      if (target.yearSubfolders) {
        await forgetYearFolders(target.id);
        try {
          uploaded = await send(await folderFor({ ...target, yearFolders: {} }, connection, file.uploadedAt));
        } catch (retryError) {
          if (retryError instanceof GoogleApiError && retryError.status === 404) throw folderGone(target.folderName);
          throw retryError;
        }
      } else throw folderGone(target.folderName);
    }
    return {
      provider: "GOOGLE_DRIVE",
      key: targetKey(kind, target.userId, uploaded.id),
      externalId: uploaded.id,
      sizeBytes: uploaded.size === undefined ? -1 : Number(uploaded.size),
      sha256: uploaded.sha256Checksum ?? null,
      md5: uploaded.md5Checksum ?? null,
    };
  },

  async discard(copy) {
    const parsed = parseTargetKey(copy.key);
    if (!parsed) return;
    const connection = await connectionOf(parsed.userId);
    if (!connection || connection.status !== "CONNECTED") return;
    // Our own copy that failed verification or lost a race: it was never a document anyone saw.
    await withGoogle(connection, (accessToken) =>
      googleJson(`${API}/files/${encodeURIComponent(parsed.fileId)}?supportsAllDrives=true`, { method: "DELETE", accessToken }),
    ).catch((error: unknown) => console.warn(`[google] removing an unverified Drive copy failed: ${errorText(error)}`));
  },

  async report(householdId, kind, error) {
    await db.googleDriveStorageTarget.updateMany({
      where: { householdId, kind },
      data: error === null ? { lastError: null, lastMovedAt: new Date() } : { lastError: error.slice(0, 300) },
    });
  },
};

const folderGone = (name: string) => new Error(`The Drive folder "${name}" is gone or can't be reached; choose a folder again`);

setStorageTargetHandler(driveTargetHandler);

/**
 * `remove` of the Drive storage backend: a document stored in Drive as a storage target was deleted for good in
 * WickedHome. Only when the household turned on "Also remove from Drive" is the Drive file moved to Drive's
 * trash (recoverable there for 30 days). Linked files (`gdrive:` keys) never get here. Never throws.
 */
export async function removeTargetFile(key: string): Promise<void> {
  const parsed = parseTargetKey(key);
  if (!parsed) return;
  try {
    const user = await db.user.findUnique({ where: { id: parsed.userId }, select: { householdId: true } });
    if (!user) return;
    const target = await db.googleDriveStorageTarget.findUnique({ where: { householdId_kind: { householdId: user.householdId, kind: parsed.kind } } });
    if (!target?.deleteInDrive) return;
    const connection = await connectionOf(parsed.userId);
    if (!connection || connection.status !== "CONNECTED") return;
    await withGoogle(connection, (accessToken) =>
      googleJson(`${API}/files/${encodeURIComponent(parsed.fileId)}?fields=id&supportsAllDrives=true`, {
        method: "PATCH",
        accessToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      }),
    );
  } catch (error) {
    console.warn(`[google] moving a deleted document to Drive's trash failed: ${errorText(error)}`);
  }
}

// ── API ──────────────────────────────────────────────────────────────────────────────────────────────

async function toTarget(viewer: SessionUser, kind: StorageTargetKind, row: TargetRow | null): Promise<DriveStorageTarget> {
  const connection = row ? await connectionOf(row.userId) : null;
  const resolved = resolveTargetState(row, connection, googleClientConfig() !== null);
  const counts = await storageTargetCounts(viewer.householdId, kind);
  return {
    kind,
    ...resolved,
    folder: row ? { name: row.folderName, mode: row.folderMode === "PICKED" ? "pick" : "create", webUrl: folderUrl(row.driveFolderId) } : null,
    owner: row
      ? { name: row.user.habitant?.name ?? row.user.email, email: connection?.googleAccountEmail ?? null, mine: row.userId === viewer.id }
      : null,
    yearSubfolders: row?.yearSubfolders ?? true,
    deleteInDrive: row?.deleteInDrive ?? false,
    counts: { inDrive: counts.inTarget, local: counts.local, pending: counts.pending, failed: counts.failed },
    lastError: counts.pending + counts.failed > 0 ? (counts.lastError ?? row?.lastError ?? null) : (row?.lastError ?? null),
    lastMovedAt: row?.lastMovedAt?.toISOString() ?? null,
  };
}

export async function getDriveStorageStatus(user: SessionUser): Promise<DriveStorageStatus> {
  const rows = await db.googleDriveStorageTarget.findMany({ where: { householdId: user.householdId }, include: targetInclude });
  const targets = await Promise.all(STORAGE_TARGET_KINDS.map((kind) => toTarget(user, kind, rows.find((row) => row.kind === kind) ?? null)));
  const own = await connectionOf(user.id);
  return {
    targets,
    viewer: {
      googleConfigured: googleClientConfig() !== null,
      connected: own?.status === "CONNECTED",
      features: own?.status === "CONNECTED" ? featuresFromScopes(own.scopes) : [],
      canManage: user.role !== "child",
    },
  };
}

/**
 * Points the target at a folder in the signed-in person's own Drive: a new folder the app creates (`drive.file`)
 * or an existing one they picked (needs `drive_full`). Files already in Drive stay where they are.
 */
export async function setupDriveStorage(user: SessionUser, kind: StorageTargetKind, input: DriveStorageSetupInput): Promise<DriveStorageStatus> {
  const connection = await requireConnection(user, featureForFolderMode(input.mode));
  let folder: { id: string; name: string };
  if (input.mode === "create") {
    folder = await createFolder(connection, input.folderName);
  } else {
    const picked = await getFolder(connection, input.driveFolderId).catch((error: unknown) => {
      if (error instanceof GoogleApiError && error.status === 404) throw notFound("Folder not found in your Drive");
      throw error;
    });
    if (picked.mimeType !== FOLDER || picked.trashed) throw badRequest("That is not a folder");
    if (picked.capabilities?.canAddChildren === false) throw badRequest("You can't add files to that folder");
    folder = picked;
  }
  const data = {
    userId: user.id,
    driveFolderId: folder.id,
    folderName: folder.name.slice(0, 200),
    folderMode: input.mode === "pick" ? ("PICKED" as const) : ("CREATED" as const),
    yearSubfolders: input.yearSubfolders ?? true,
    yearFolders: {},
    lastError: null,
  };
  await db.googleDriveStorageTarget.upsert({
    where: { householdId_kind: { householdId: user.householdId, kind } },
    create: { householdId: user.householdId, kind, ...data },
    update: data,
  });
  return getDriveStorageStatus(user);
}

async function requireTarget(user: SessionUser, kind: StorageTargetKind) {
  const target = await findTarget(user.householdId, kind);
  if (!target) throw notFound("Saving to Google Drive is not set up");
  return target;
}

export async function updateDriveStorage(user: SessionUser, kind: StorageTargetKind, input: DriveStorageUpdateInput): Promise<DriveStorageStatus> {
  const target = await requireTarget(user, kind);
  await db.googleDriveStorageTarget.update({
    where: { id: target.id },
    data: {
      ...(input.yearSubfolders !== undefined && { yearSubfolders: input.yearSubfolders }),
      ...(input.deleteInDrive !== undefined && { deleteInDrive: input.deleteInDrive }),
    },
  });
  return getDriveStorageStatus(user);
}

/** Stops saving to Drive: new files stay on the server, nothing waits any more. Files in Drive stay there and keep opening. */
export async function disableDriveStorage(user: SessionUser, kind: StorageTargetKind): Promise<DriveStorageStatus> {
  const target = await requireTarget(user, kind);
  await db.googleDriveStorageTarget.delete({ where: { id: target.id } });
  await forgetPendingFiles(user.householdId, kind);
  return getDriveStorageStatus(user);
}

/** "Move existing bill documents to Drive": queues them; the move job copies, verifies, then removes local copies. */
export async function moveExistingToDrive(user: SessionUser, kind: StorageTargetKind): Promise<{ queued: number }> {
  const target = await requireTarget(user, kind);
  const connection = await connectionOf(target.userId);
  if (resolveTargetState(target, connection, googleClientConfig() !== null).state !== "active") {
    throw conflict("Google Drive isn't available for this right now");
  }
  return { queued: await queueExistingFiles(user.householdId, kind) };
}
