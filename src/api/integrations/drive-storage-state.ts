import { featureForFolderMode, type DriveStoragePausedReason, type DriveStorageState } from "@/features/integrations/types/drive-storage";
import { featuresFromScopes, type GoogleFeature } from "@/features/integrations/types/google";
import type { StorageTargetState } from "../documents/storage/storage-targets";

/*
 * Pure rules of Google Drive as a storage target (unit-tested in drive-storage.test.ts).
 */

const TIME_ZONE = "Europe/Brussels";

/**
 * Whether a target can be used now, from its folder mode and the owner's connection. A missing connection
 * (disconnected) is `paused/disconnected`, which the documents feature treats as off: new files stay local and
 * nothing is queued. A refused consent or a missing scope queues files until it's fixed.
 */
export function resolveTargetState(
  target: { folderMode: "CREATED" | "PICKED" } | null,
  connection: { status: "CONNECTED" | "NEEDS_RECONNECT"; scopes: readonly string[] } | null,
  configured = true,
): { state: DriveStorageState; pausedReason: DriveStoragePausedReason | null } {
  if (!target) return { state: "off", pausedReason: null };
  if (!configured || !connection) return { state: "paused", pausedReason: "disconnected" };
  if (connection.status !== "CONNECTED") return { state: "paused", pausedReason: "needs_reconnect" };
  const needed: GoogleFeature = featureForFolderMode(target.folderMode === "PICKED" ? "pick" : "create");
  if (!featuresFromScopes(connection.scopes).includes(needed)) return { state: "paused", pausedReason: "missing_scope" };
  return { state: "active", pausedReason: null };
}

/** The documents feature's view: disconnected = off (stay local, nothing queued), other pauses = queue and retry. */
export function handlerState(resolved: ReturnType<typeof resolveTargetState>): StorageTargetState {
  if (resolved.state === "active") return "active";
  if (resolved.state === "off" || resolved.pausedReason === "disconnected") return "off";
  return "paused";
}

/** The year folder a file goes into ("2026"), by its upload date in Brussels. */
export const yearOf = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric" }).format(date);
