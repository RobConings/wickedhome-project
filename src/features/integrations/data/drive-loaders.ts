import type { LoaderFunctionArgs } from "react-router";
import type { DriveFolderListing } from "../types/google";
import { fetchDriveListing } from "./google-requests";

/** Search parameter of `/documents/drive/:linkId` holding the open sub-folder (a Drive folder id). */
export const DRIVE_FOLDER_PARAM = "folder";

export type DriveFolderLoaderData = {
  linkId: string;
  /** Deferred: Google can be slow; `null` when it couldn't be read. */
  listing: Promise<DriveFolderListing | null>;
};

/** `/documents/drive/:linkId[?folder=]`: a linked Drive folder, read live from Drive through the server. */
export function driveFolderLoader({ params, request }: LoaderFunctionArgs): DriveFolderLoaderData {
  const linkId = params.linkId ?? "";
  const folderId = new URL(request.url).searchParams.get(DRIVE_FOLDER_PARAM) ?? undefined;
  return { linkId, listing: fetchDriveListing(linkId, folderId).catch(() => null) };
}
