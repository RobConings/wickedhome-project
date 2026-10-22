import { config } from "../../lib/config";
import { GoogleDriveStorageProvider } from "./google-drive-storage-provider";
import { LocalStorageProvider } from "./local-storage-provider";
import type { StorageProvider, StorageProviderName } from "./storage-provider";

let local: LocalStorageProvider | undefined;
let googleDrive: GoogleDriveStorageProvider | undefined;

/** New uploads go here. */
export const DEFAULT_STORAGE_PROVIDER: StorageProviderName = "LOCAL";

/** The provider that holds a file, by the `storageProvider` stored on its row. */
export function storageProvider(name: StorageProviderName = DEFAULT_STORAGE_PROVIDER): StorageProvider {
  if (name === "GOOGLE_DRIVE") return (googleDrive ??= new GoogleDriveStorageProvider());
  return (local ??= new LocalStorageProvider(config.STORAGE_DIR));
}

/** Absolute root of local storage, for disk usage. */
export const localStorageRoot = () => config.STORAGE_DIR;
