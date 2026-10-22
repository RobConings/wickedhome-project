import path from "node:path";
import { HIT_TTL_MS, MISS_TTL_MS } from "./barcode-lookup";

/*
 * Barcode cache cleanup: what the `shopping.barcode-cache` job (shopping.jobs.ts) deletes
 * ──────────────────────────────────────────────────────────────────────────────────────
 * Lookups are reused for 90 days (hits) or 7 (misses); after that a scan asks the sources again and
 * refreshes the row. Rows nobody scanned for much longer than that are deleted: hits after 180 days,
 * misses after 30. A row whose photo a saved product or shopping item still shows
 * (`/api/shopping/barcode/<code>/image`) is kept, photo included, however old it is: the photo is served
 * from the row. Everything here is pure; the database and file work is in barcode-lookup.service.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A cached hit nobody needed for this long is deleted (twice its reuse period). */
export const HIT_KEEP_MS = 180 * DAY_MS;
/** A cached miss nobody needed for this long is deleted. */
export const MISS_KEEP_MS = 30 * DAY_MS;

// Keep longer than the reuse periods: a row is never deleted while it can still answer a scan.
if (HIT_KEEP_MS <= HIT_TTL_MS || MISS_KEEP_MS <= MISS_TTL_MS) throw new Error("Barcode cache kept shorter than it is reused");

/** Content type → file extension of the stored product photos (`product-images/<code>.<ext>`). */
export const PRODUCT_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
/** Extension used for an unknown content type (never written in practice). */
export const UNKNOWN_IMAGE_EXTENSION = "img";

/** Normalised codes are EAN-8 or EAN-13: digits only, so they are safe in a file name. */
const CODE_PATTERN = /^\d{8,14}$/;
const IMAGE_URL_PATTERN = /^\/api\/shopping\/barcode\/(\d{8,14})\/image(?:[?#].*)?$/;

export type CachedLookup = { code: string; found: boolean; fetchedAt: Date };

/** Rows fetched before these moments are past keeping (hits / misses). */
export function expiryCutoffs(now: Date): { hit: Date; miss: Date } {
  return { hit: new Date(now.getTime() - HIT_KEEP_MS), miss: new Date(now.getTime() - MISS_KEEP_MS) };
}

export function isExpiredLookup(row: Pick<CachedLookup, "found" | "fetchedAt">, now: Date): boolean {
  const cutoffs = expiryCutoffs(now);
  return row.fetchedAt.getTime() < (row.found ? cutoffs.hit : cutoffs.miss).getTime();
}

/** The code whose stored photo an `imageUrl` points at, or null for any other URL. */
export function codeFromBarcodeImageUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl ? (IMAGE_URL_PATTERN.exec(imageUrl)?.[1] ?? null) : null;
}

/** The codes to delete: expired rows whose photo no saved product or item uses. */
export function selectExpiredLookups(rows: readonly CachedLookup[], referencedCodes: ReadonlySet<string>, now: Date): string[] {
  return rows.filter((row) => isExpiredLookup(row, now) && !referencedCodes.has(row.code)).map((row) => row.code);
}

/**
 * Every file a code's photo may be stored in (one per extension: the photo's type can change between
 * lookups), resolved inside `dir`. Empty for anything that isn't a plain code, and a path that would
 * resolve outside `dir` is never returned.
 */
export function productImageFiles(dir: string, code: string): string[] {
  if (!CODE_PATTERN.test(code)) return [];
  const root = path.resolve(dir);
  const extensions = [...new Set([...Object.values(PRODUCT_IMAGE_TYPES), UNKNOWN_IMAGE_EXTENSION])];
  return extensions
    .map((extension) => path.resolve(root, `${code}.${extension}`))
    .filter((file) => path.dirname(file) === root && !path.relative(root, file).startsWith(".."));
}
