import type { StorageTargetKind } from "@/features/documents";
import { api } from "@/lib/api-client";
import type {
  DriveStorageMoveResult,
  DriveStorageSetupInput,
  DriveStorageStatus,
  DriveStorageUpdateInput,
} from "../types/drive-storage";
import { fetchDriveFolders, linkDriveFolder, startGoogleConnect } from "./google-requests";

const base = "/integrations/google/drive/storage";
const kindPath = (kind: StorageTargetKind) => `${base}/${encodeURIComponent(kind)}`;

/** Loader-friendly: the household's Drive storage targets and what the viewer can do. */
export const fetchDriveStorageStatus = () => api.get<DriveStorageStatus>(base);

/** Everything the "bill documents in Drive" card asks the API, in one object so stories can pass a fake. */
export const driveStorageClient = {
  status: fetchDriveStorageStatus,
  setup: (kind: StorageTargetKind, input: DriveStorageSetupInput) => api.put<DriveStorageStatus>(kindPath(kind), input),
  update: (kind: StorageTargetKind, input: DriveStorageUpdateInput) => api.patch<DriveStorageStatus>(kindPath(kind), input),
  disable: (kind: StorageTargetKind) => api.delete<DriveStorageStatus>(kindPath(kind)),
  moveExisting: (kind: StorageTargetKind) => api.post<DriveStorageMoveResult>(`${kindPath(kind)}/move-existing`),
  /** Incremental consent (e.g. `drive_full` before picking an existing folder); the browser then goes to Google. */
  start: startGoogleConnect,
  /** For the folder picker. */
  driveFolders: fetchDriveFolders,
  linkDriveFolder,
};

export type DriveStorageClient = typeof driveStorageClient;
