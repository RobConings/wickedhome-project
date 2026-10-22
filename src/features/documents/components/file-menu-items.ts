import * as React from "react";
import type { DocumentFile } from "../types/documents";

/**
 * Extra entries for a file's ⋯ menu, contributed by other features through the route (e.g. "Save to Drive"
 * from the integrations feature). Return `DropdownMenuItem`s, or nothing for files they don't apply to.
 */
export type FileMenuItems = (file: DocumentFile) => React.ReactNode;

/** Provided by `DocumentsScreen` (prop `fileMenuItems`), read by every file menu, so rows and tiles don't pass it on. */
export const FileMenuItemsContext = React.createContext<FileMenuItems | null>(null);
