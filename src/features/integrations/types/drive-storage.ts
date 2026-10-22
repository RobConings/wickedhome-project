import { z } from "zod";
import type { StorageTargetKind } from "@/features/documents";
import type { GoogleFeature } from "./google";

/*
 * Google Drive as a storage target: a kind of household document (bills first, see STORAGE_TARGETS in the
 * documents contract) is stored in a folder of one person's Drive instead of on the server. Contracts for
 * `/api/integrations/google/drive/storage*`. See docs/INTEGRATIONS.md "Drive as storage for bill documents".
 */

// ── Folder choice and scopes ─────────────────────────────────────────────────────────────────────────

/**
 * - `create`: the app creates a new folder (e.g. "Facturen") in the person's My Drive. Works with `drive.file`
 *   (already granted with Drive): the app may write into folders it created. The person can move or rename
 *   it in Drive afterwards; it keeps working (Drive ids don't change).
 * - `pick`: an existing folder the person made. `drive.file` can't write there, so this needs the full `drive`
 *   scope (feature `drive_full`), asked only when someone chooses this.
 */
export const DRIVE_FOLDER_MODES = ["create", "pick"] as const;
export const driveFolderModeSchema = z.enum(DRIVE_FOLDER_MODES);
export type DriveFolderMode = z.infer<typeof driveFolderModeSchema>;

/** The Google feature (scopes) a folder mode needs. */
export const featureForFolderMode = (mode: DriveFolderMode): GoogleFeature => (mode === "pick" ? "drive_full" : "drive");

/**
 * What still has to be granted before someone can use `mode`: `null` when they can go ahead, else the feature to
 * ask consent for (incrementally). Without Drive at all it is always `drive` first (browsing the folder picker
 * needs `drive.readonly`).
 */
export function missingFeatureForFolderMode(mode: DriveFolderMode, granted: readonly GoogleFeature[]): GoogleFeature | null {
  if (!granted.includes("drive")) return "drive";
  const needed = featureForFolderMode(mode);
  return granted.includes(needed) ? null : needed;
}

// ── Status ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * - `off`: not set up; files are stored on the server.
 * - `active`: new files of this kind go to the Drive folder.
 * - `paused`: set up, but the person whose Drive it is can't be used now (`pausedReason`): new files stay on the
 *   server. `disconnected`: they disconnected Google (files stay local, nothing is queued). `needs_reconnect` /
 *   `missing_scope`: files are queued and move once that's fixed.
 */
export const DRIVE_STORAGE_STATES = ["off", "active", "paused"] as const;
export type DriveStorageState = (typeof DRIVE_STORAGE_STATES)[number];
export type DriveStoragePausedReason = "disconnected" | "needs_reconnect" | "missing_scope";

export type DriveStorageTarget = {
  kind: StorageTargetKind;
  state: DriveStorageState;
  pausedReason: DriveStoragePausedReason | null;
  /** `null` while off. */
  folder: { name: string; mode: DriveFolderMode; webUrl: string } | null;
  /** Whose Drive (their connection uploads). `mine`: the viewer's own. */
  owner: { name: string; email: string | null; mine: boolean } | null;
  yearSubfolders: boolean;
  deleteInDrive: boolean;
  /** Files of this kind: in Drive, on the server (not queued), queued, and queued but failed several times. */
  counts: { inDrive: number; local: number; pending: number; failed: number };
  lastError: string | null;
  lastMovedAt: string | null;
};

/** `GET /api/integrations/google/drive/storage`. */
export type DriveStorageStatus = {
  targets: DriveStorageTarget[];
  /** What the viewer can do: `null` features when they have no (working) Google connection. */
  viewer: {
    googleConfigured: boolean;
    connected: boolean;
    features: GoogleFeature[];
    /** Owners and adults change the setting; the target always uses the Drive of whoever set it up. */
    canManage: boolean;
  };
};

// ── Inputs ───────────────────────────────────────────────────────────────────────────────────────────

const driveIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);

/** Body of `PUT /api/integrations/google/drive/storage/:kind`: (re)point the target at a folder in *your* Drive. */
export const driveStorageSetupSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    folderName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      // eslint-disable-next-line no-control-regex
      .regex(/^[^/\\\u0000-\u001f\u007f]+$/, { message: "No slashes or control characters" }),
    yearSubfolders: z.boolean().default(true),
  }),
  z.object({ mode: z.literal("pick"), driveFolderId: driveIdSchema, yearSubfolders: z.boolean().default(true) }),
]);
export type DriveStorageSetupInput = z.input<typeof driveStorageSetupSchema>;

/** Body of `PATCH /api/integrations/google/drive/storage/:kind`. */
export const driveStorageUpdateSchema = z
  .object({ yearSubfolders: z.boolean().optional(), deleteInDrive: z.boolean().optional() })
  .refine((value) => value.yearSubfolders !== undefined || value.deleteInDrive !== undefined, { message: "Nothing to update" });
export type DriveStorageUpdateInput = z.infer<typeof driveStorageUpdateSchema>;

/** `POST …/storage/:kind/move-existing`: how many files are queued now. */
export type DriveStorageMoveResult = { queued: number };
