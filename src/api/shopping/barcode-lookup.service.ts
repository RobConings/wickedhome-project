import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isInStoreCode,
  normalizeBarcode,
  type BarcodeLookupResult,
} from "@/features/shopping/types/barcode-lookup";
import type { Locale } from "@/types/common";
import { config } from "../lib/config";
import { db, Prisma } from "../lib/db";
import { fetchBytesFromFixedHost, fetchJsonFromFixedHost } from "../lib/fixed-host-fetch";
import { badRequest, notFound } from "../lib/http";
import { sniffImageType } from "../shops/shop-icon";
import {
  SOURCES,
  SOURCE_IMAGE_HOSTS,
  askSources,
  isFreshLookup,
  isUsableRecord,
  toLookupRecord,
  toSuggestion,
  type LookupRecord,
} from "./barcode-lookup";
import {
  PRODUCT_IMAGE_TYPES,
  UNKNOWN_IMAGE_EXTENSION,
  codeFromBarcodeImageUrl,
  expiryCutoffs,
  productImageFiles,
  selectExpiredLookups,
} from "./barcode-cache";

/*
 * Barcode auto-fill: cache, limits and photos
 * ───────────────────────────────────────────
 * `lookupBarcode` answers from the `barcode_lookups` cache when it can (hits for 90 days, misses for 7) and
 * otherwise asks the public product databases (see barcode-lookup.ts). The cache is shared by all
 * households: it holds public product data only, never anything a household typed.
 *
 * Limits, well under the sources' 15 product reads per minute per IP:
 * - at most 10 source reads per minute for the whole server (a lookup costs one or two);
 * - at most 6 lookups that reach the sources per minute per household (cached answers are free);
 * - 4 s timeout per read, 300 KB per answer; one lookup per code at a time (a second scan joins the first).
 * Over a limit, or when a source can't be reached, the answer is `unavailable` (nothing is cached) and an
 * older cached answer is used when there is one.
 *
 * Photos are downloaded once, from the sources' fixed image hosts only (max 512 KB, JPEG/PNG/WebP/GIF by
 * their magic bytes), into STORAGE_DIR/product-images/<code>.<ext>, and served by the app from
 * `/api/shopping/barcode/<code>/image`, so the browser never contacts the sources. A product the user saves
 * may point at that path, so a photo (and its row) is only deleted by `cleanUpBarcodeCache` (the daily
 * `shopping.barcode-cache` job) when it is long expired and nothing points at it (see barcode-cache.ts).
 */

const USER_AGENT = `WickedHome/1.0 (+${config.PUBLIC_URL})`;
const READ_TIMEOUT_MS = 4000;
const MAX_ANSWER_BYTES = 300_000;
const IMAGE_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 512 * 1024;
const WINDOW_MS = 60_000;
const SERVER_READS_PER_MINUTE = 10;
const HOUSEHOLD_LOOKUPS_PER_MINUTE = 6;

const IMAGE_TYPES = PRODUCT_IMAGE_TYPES;
const imageDir = () => path.resolve(config.STORAGE_DIR, "product-images");
const imagePath = (code: string, type: string) => path.join(imageDir(), `${code}.${IMAGE_TYPES[type] ?? UNKNOWN_IMAGE_EXTENSION}`);

class LookupUnavailable extends Error {}

// Sliding-window counters (in memory: one process; a restart resets them, which is fine) ----------------

function slidingWindow(limit: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit and returns true, or returns false when the key is at its limit. */
    take(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

const serverReads = slidingWindow(SERVER_READS_PER_MINUTE);
const householdLookups = slidingWindow(HOUSEHOLD_LOOKUPS_PER_MINUTE);

// Asking the sources -------------------------------------------------------------------------------------

async function fetchSourceJson(kind: keyof typeof SOURCES, url: string): Promise<unknown> {
  if (!serverReads.take("all")) throw new LookupUnavailable("Too many reads this minute");
  try {
    return await fetchJsonFromFixedHost(url, {
      allowedHosts: [SOURCES[kind].apiHost],
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: READ_TIMEOUT_MS,
      maxBytes: MAX_ANSWER_BYTES,
      // "Not found" and "found with another product type" come as a 404 with a JSON reason.
      acceptStatuses: [404],
    });
  } catch (error) {
    throw new LookupUnavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Downloads and stores the photo; returns its content type, or null when there is none (never throws). */
async function storeImage(code: string, sourceUrl: string | null): Promise<string | null> {
  if (!sourceUrl) return null;
  try {
    const { bytes } = await fetchBytesFromFixedHost(sourceUrl, {
      allowedHosts: SOURCE_IMAGE_HOSTS,
      headers: { "User-Agent": USER_AGENT, Accept: "image/webp,image/jpeg,image/png,image/*;q=0.8" },
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: MAX_IMAGE_BYTES,
    });
    const type = sniffImageType(bytes);
    if (!type || !IMAGE_TYPES[type]) return null;
    await mkdir(imageDir(), { recursive: true, mode: 0o700 });
    const target = imagePath(code, type);
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temp, bytes, { mode: 0o600 });
    await rename(temp, target).catch(async (error: unknown) => {
      await unlink(temp).catch(() => undefined);
      throw error;
    });
    return type;
  } catch (error) {
    console.warn(`Product photo for ${code} not stored: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

type Fetched = { found: true; record: LookupRecord; imageType: string | null } | { found: false };

const inFlight = new Map<string, Promise<Fetched>>();

/** Asks the sources and caches the answer. Throws `LookupUnavailable` when they can't be asked. */
function fetchAndCache(code: string): Promise<Fetched> {
  const running = inFlight.get(code);
  if (running) return running;
  const task = (async (): Promise<Fetched> => {
    const answer = await askSources(code, fetchSourceJson).catch((error: unknown) => {
      throw error instanceof LookupUnavailable ? error : new LookupUnavailable(String(error));
    });
    const record = answer ? toLookupRecord(answer.product, answer.productType) : null;
    const now = new Date();
    if (!record || !isUsableRecord(record)) {
      // A miss keeps an earlier photo: a saved product may still show it.
      await db.barcodeLookup.upsert({
        where: { code },
        create: { code, found: false, data: Prisma.DbNull, fetchedAt: now },
        update: { found: false, data: Prisma.DbNull, fetchedAt: now },
      });
      return { found: false };
    }
    const imageType = await storeImage(code, record.imageSourceUrl);
    const data = record as unknown as Prisma.InputJsonValue;
    const row = await db.barcodeLookup.upsert({
      where: { code },
      create: { code, found: true, data, imageType, fetchedAt: now },
      update: { found: true, data, fetchedAt: now, ...(imageType && { imageType }) },
      select: { imageType: true },
    });
    return { found: true, record, imageType: row.imageType };
  })().finally(() => inFlight.delete(code));
  inFlight.set(code, task);
  return task;
}

// Lookups ------------------------------------------------------------------------------------------------

/** The normalised code, or a 400 when it isn't a product barcode. */
export function parseLookupCode(raw: string): string {
  const code = normalizeBarcode(raw);
  if (!code) throw badRequest("Not a valid barcode", { code: ["Not a valid EAN or UPC barcode"] });
  return code;
}

function answer(code: string, row: { found: boolean; data: unknown; imageType: string | null }, locale: Locale): BarcodeLookupResult {
  const suggestion = row.found && row.data ? toSuggestion(code, row.data as LookupRecord, locale, Boolean(row.imageType)) : null;
  return { code, status: suggestion ? "found" : "not_found", suggestion };
}

/**
 * What a barcode is, from the cache or the sources. Never throws for "unknown" or "can't ask now": those
 * are the `not_found` and `unavailable` statuses (an older cached answer is preferred over `unavailable`).
 */
export async function lookupBarcode(householdId: string, rawCode: string, locale: Locale): Promise<BarcodeLookupResult> {
  const code = parseLookupCode(rawCode);
  if (isInStoreCode(code)) return { code, status: "not_found", suggestion: null };

  const cached = await db.barcodeLookup.findUnique({ where: { code }, select: { found: true, data: true, imageType: true, fetchedAt: true } });
  if (cached && isFreshLookup(cached)) return answer(code, cached, locale);

  const fallback = (): BarcodeLookupResult =>
    cached?.found ? answer(code, cached, locale) : { code, status: "unavailable", suggestion: null };

  if (!householdLookups.take(householdId)) return fallback();
  try {
    const fetched = await fetchAndCache(code);
    return fetched.found
      ? answer(code, { found: true, data: fetched.record, imageType: fetched.imageType }, locale)
      : { code, status: "not_found", suggestion: null };
  } catch (error) {
    if (!(error instanceof LookupUnavailable)) throw error;
    console.warn(`Barcode lookup for ${code} unavailable: ${error.message}`);
    return fallback();
  }
}

/** The stored photo of a looked-up code (404 when there is none). */
export async function loadBarcodeImage(rawCode: string): Promise<{ contentType: string; bytes: Buffer }> {
  const code = parseLookupCode(rawCode);
  const row = await db.barcodeLookup.findUnique({ where: { code }, select: { imageType: true } });
  if (!row?.imageType || !IMAGE_TYPES[row.imageType]) throw notFound("No photo");
  try {
    return { contentType: row.imageType, bytes: await readFile(imagePath(code, row.imageType)) };
  } catch {
    throw notFound("No photo");
  }
}

// Cleanup (the `shopping.barcode-cache` job) ------------------------------------------------------------

const CLEANUP_BATCH = 500;
const BARCODE_IMAGE_PREFIX = "/api/shopping/barcode/";

export type BarcodeCacheCleanup = { rows: number; photos: number; kept: number; failedPhotos: number };

/**
 * Deletes cache rows long past reuse (barcode-cache.ts) and their photos in STORAGE_DIR/product-images.
 * Rows whose photo a saved product or shopping item shows are kept. Safe to run twice: a second run finds
 * nothing. A photo that can't be deleted is logged and counted; its row is gone either way.
 */
export async function cleanUpBarcodeCache(
  { signal, log }: { signal: AbortSignal; log: (message: string) => void },
  now = new Date(),
): Promise<BarcodeCacheCleanup> {
  const cutoffs = expiryCutoffs(now);
  const expiredWhere = {
    OR: [
      { found: true, fetchedAt: { lt: cutoffs.hit } },
      { found: false, fetchedAt: { lt: cutoffs.miss } },
    ],
  } satisfies Prisma.BarcodeLookupWhereInput;
  const usesPhoto = { imageUrl: { startsWith: BARCODE_IMAGE_PREFIX } };

  const [candidates, products, items] = await Promise.all([
    db.barcodeLookup.findMany({ where: expiredWhere, select: { code: true, found: true, fetchedAt: true } }),
    db.product.findMany({ where: usesPhoto, select: { imageUrl: true }, distinct: ["imageUrl"] }),
    db.shoppingItem.findMany({ where: usesPhoto, select: { imageUrl: true }, distinct: ["imageUrl"] }),
  ]);
  const referenced = new Set(
    [...products, ...items].flatMap((row) => {
      const code = codeFromBarcodeImageUrl(row.imageUrl);
      return code ? [code] : [];
    }),
  );
  // A scan of that code right now rewrites the row and its photo: leave it alone.
  const codes = selectExpiredLookups(candidates, referenced, now).filter((code) => !inFlight.has(code));
  const result: BarcodeCacheCleanup = { rows: 0, photos: 0, kept: candidates.length - codes.length, failedPhotos: 0 };

  const dir = imageDir();
  for (let start = 0; start < codes.length; start += CLEANUP_BATCH) {
    signal.throwIfAborted();
    const batch = codes.slice(start, start + CLEANUP_BATCH);
    // Re-checking the age here skips a row a scan refreshed since it was selected.
    const { count } = await db.barcodeLookup.deleteMany({ where: { code: { in: batch }, ...expiredWhere } });
    result.rows += count;
    const remaining = await db.barcodeLookup.findMany({ where: { code: { in: batch } }, select: { code: true } });
    const stillThere = new Set(remaining.map((row) => row.code));
    for (const code of batch) {
      if (stillThere.has(code)) continue;
      for (const file of productImageFiles(dir, code)) {
        try {
          await unlink(file);
          result.photos += 1;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          result.failedPhotos += 1;
          log(`Photo ${path.basename(file)} not deleted: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
  return result;
}
