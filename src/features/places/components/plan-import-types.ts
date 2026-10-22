import type { FloorUnderlay } from "../types/places";

/**
 * What the import dialog hands to the editor: the stored files, the crop and the labels it found, plus
 * the quarter turn (0, 90, 180 or 270° clockwise) the preview was turned to in the crop step.
 */
export type PlanImportResult = Pick<
  FloorUnderlay,
  "sourceFileId" | "imageFileId" | "sourceName" | "sourceMimeType" | "unit" | "page" | "crop" | "labels"
> & { rotation: number };

/** File types the import accepts. */
export const PLAN_IMPORT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const PLAN_IMPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
