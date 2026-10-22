import type { DriveStorageClient } from "@/features/integrations/data/drive-storage-requests";
import type { DriveStorageStatus, DriveStorageTarget } from "@/features/integrations/types/drive-storage";
import type { DriveItem } from "@/features/integrations/types/google";

/* Example data for the "Bill documents in Google Drive" card (src/features/integrations/components/drive-storage-card.tsx). */

const wait = <T,>(value: T, ms = 600) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const never = <T,>() => new Promise<T>(() => undefined);

const off: DriveStorageTarget = {
  kind: "bills",
  state: "off",
  pausedReason: null,
  folder: null,
  owner: null,
  yearSubfolders: true,
  deleteInDrive: false,
  counts: { inDrive: 0, local: 23, pending: 0, failed: 0 },
  lastError: null,
  lastMovedAt: null,
};

const active: DriveStorageTarget = {
  ...off,
  state: "active",
  folder: { name: "Facturen", mode: "create", webUrl: "https://drive.google.com/drive/folders/1FaCtUrEn" },
  owner: { name: "Rob", email: "rob@gmail.com", mine: true },
  counts: { inDrive: 41, local: 0, pending: 0, failed: 0 },
  lastMovedAt: "2026-10-03T08:12:00.000Z",
};

const viewer = (features: DriveStorageStatus["viewer"]["features"], connected = true): DriveStorageStatus["viewer"] => ({
  googleConfigured: true,
  connected,
  features,
  canManage: true,
});

const status = (target: DriveStorageTarget, features: DriveStorageStatus["viewer"]["features"] = ["drive"], connected = true): DriveStorageStatus => ({
  targets: [target],
  viewer: viewer(features, connected),
});

export const driveStorageFixtures = {
  /** Google isn't set up on the server yet. */
  notConfigured: { targets: [off], viewer: { googleConfigured: false, connected: false, features: [], canManage: true } } satisfies DriveStorageStatus,
  /** Off, and the viewer hasn't turned on Drive. */
  notConnected: status(off, ["gmail"]),
  /** Off; the viewer has Drive: choose a folder (new, or existing which needs the extra permission). */
  chooseFolder: status(off, ["drive", "gmail"]),
  /** Off; the viewer already granted full Drive access: picking an existing folder opens the picker. */
  chooseFolderFullDrive: status(off, ["drive", "drive_full"]),
  /** On, everything in Drive. */
  active: status(active),
  /** On, with older bill documents still on the server: "Move 23 documents to Drive". */
  activeWithLocal: status({ ...active, counts: { inDrive: 18, local: 23, pending: 0, failed: 0 } }),
  /** Drive failed for a few uploads: kept on the server, retried by the job. */
  fallbackPending: status({
    ...active,
    counts: { inDrive: 39, local: 0, pending: 2, failed: 1 },
    lastError: "www.googleapis.com/upload/drive/v3/files answered 403 (storageQuotaExceeded)",
  }),
  /** Saved in Clara's Drive, an existing folder she picked; seen by Rob. */
  otherPersonsDrive: status(
    { ...active, folder: { name: "Huis/Facturen", mode: "pick", webUrl: "https://drive.google.com/drive/folders/1HuIs" }, owner: { name: "Clara", email: "clara@gmail.com", mine: false } },
    ["drive"],
  ),
  /** Clara disconnected Google: paused, new bills stay on the server. */
  pausedDisconnected: status(
    { ...active, state: "paused", pausedReason: "disconnected", owner: { name: "Clara", email: null, mine: false }, counts: { inDrive: 41, local: 3, pending: 0, failed: 0 } },
    ["drive"],
  ),
  /** Google refused Rob's consent: paused, new bills wait on the server. */
  pausedNeedsReconnect: status({ ...active, state: "paused", pausedReason: "needs_reconnect", counts: { inDrive: 41, local: 0, pending: 2, failed: 0 } }, [], false),
} satisfies Record<string, DriveStorageStatus>;

const folders: DriveItem[] = [
  { id: "1FaCtUrEn", name: "Facturen", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: null, webUrl: null, downloadable: false, linkable: false },
  { id: "1HuIs", name: "Huis", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: null, webUrl: null, downloadable: false, linkable: false },
];

/** A fake API for the card. `moveExisting` makes the next status calls count the queued files down. */
export function fakeDriveStorageClient(initial: DriveStorageStatus, options: { hang?: boolean; fail?: boolean } = {}): DriveStorageClient {
  let current = initial;
  let moving = 0;
  const answer = <T,>(value: T) => (options.hang ? never<T>() : options.fail ? wait(value).then(() => Promise.reject(new Error("fake failure"))) : wait(value));
  const withTarget = (update: Partial<DriveStorageTarget>) => {
    current = { ...current, targets: current.targets.map((target) => ({ ...target, ...update })) };
    return current;
  };
  return {
    status: () => {
      const target = current.targets[0];
      if (moving > 0 && target) {
        moving -= 1;
        withTarget({ counts: { ...target.counts, pending: Math.max(0, target.counts.pending - 1), inDrive: target.counts.inDrive + 1 } });
      }
      return answer(current);
    },
    setup: (_kind, input) =>
      answer(
        withTarget({
          state: "active",
          folder: { name: input.mode === "create" ? input.folderName : "Facturen", mode: input.mode, webUrl: "https://drive.google.com/drive/folders/1New" },
          owner: { name: "Rob", email: "rob@gmail.com", mine: true },
          yearSubfolders: input.yearSubfolders ?? true,
        }),
      ),
    update: (_kind, input) => answer(withTarget(input)),
    disable: () => answer(withTarget({ state: "off", folder: null, owner: null })),
    moveExisting: () => {
      const target = current.targets[0];
      const queued = target ? target.counts.local + target.counts.pending + target.counts.failed : 0;
      if (target) withTarget({ counts: { ...target.counts, local: 0, pending: queued, failed: 0 } });
      moving = queued;
      return answer({ queued });
    },
    start: () => never(),
    driveFolders: () => answer(folders),
    linkDriveFolder: () => never(),
  };
}
