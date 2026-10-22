import { createHash } from "node:crypto";
import { db, type Prisma } from "../lib/db";
import { discoverShopIcon } from "./shop-icon";

/*
 * Stores shop icons and fetches them in the background:
 * - after a shop is created or its website changes (never blocking the response);
 * - lazily when shops are listed: shops with a website that was never tried;
 * - daily, by the `shops.icons` job (shops.jobs.ts): retries shops whose last try failed;
 * - on demand via POST /api/shops/:id/icon/refresh, which waits for the result.
 * At most 3 fetches run at once and a shop is never fetched twice at the same time in this process.
 */

const CONCURRENCY = 3;
/** A failed fetch is retried by the next daily job run (a bit under 24 h, so a run a few seconds early still retries). */
const RETRY_AFTER_MS = 20 * 60 * 60 * 1000;

/** The icon fields a shop query selects to build `iconUrl` and decide whether to fetch (never the bytes). */
export const iconStateSelect = { select: { fetchedAt: true, lastAttemptAt: true, websiteUrl: true } } as const;
export type ShopIconState = { fetchedAt: Date | null; lastAttemptAt: Date; websiteUrl: string | null } | null;

/** Versioned so clients cache the image for a week and still see a refreshed icon at once. */
export const shopIconUrl = (shopId: string, icon: ShopIconState) =>
  icon?.fetchedAt ? `/api/shops/${encodeURIComponent(shopId)}/icon?v=${icon.fetchedAt.getTime()}` : null;

/** A shop with a website whose icon was never tried (or was tried for a previous website): fetch it right away. */
export function needsFirstIcon(shop: { websiteUrl: string | null; icon: ShopIconState }): boolean {
  if (!shop.websiteUrl) return false;
  return !shop.icon || shop.icon.websiteUrl !== shop.websiteUrl;
}

/** A shop with a website needs a fetch when it has never been tried, its website changed, or it has no icon and the last try is about a day old. */
export function needsIcon(shop: { websiteUrl: string | null; icon: ShopIconState }, now = Date.now()): boolean {
  if (!shop.websiteUrl) return false;
  if (needsFirstIcon(shop)) return true;
  const { icon } = shop;
  if (!icon || icon.fetchedAt) return false;
  return now - icon.lastAttemptAt.getTime() > RETRY_AFTER_MS;
}

/**
 * The daily retry (job `shops.icons`): fetches every shop, of any household, that `needsIcon`, at most
 * `CONCURRENCY` at a time. Stops starting new fetches once `signal` aborts.
 */
export async function retryMissingShopIcons(signal: AbortSignal): Promise<{ due: number; fetched: number; failed: number }> {
  const shops = await db.shop.findMany({
    where: { websiteUrl: { not: null } },
    select: { id: true, websiteUrl: true, icon: iconStateSelect },
  });
  const due = shops.filter((shop) => needsIcon(shop)).map((shop) => shop.id);
  let fetched = 0;
  let failed = 0;
  for (let index = 0; index < due.length && !signal.aborted; index += CONCURRENCY) {
    const results = await Promise.all(
      due.slice(index, index + CONCURRENCY).map((shopId) =>
        fetchShopIcon(shopId).catch((error: unknown): IconFetchResult => ({ ok: false, reason: String(error) })),
      ),
    );
    for (const result of results) {
      if (result.ok) fetched += 1;
      else failed += 1;
    }
  }
  return { due: due.length, fetched, failed };
}

// Concurrency limit + per-shop de-duplication ------------------------------------------------------------

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    return await task();
  } finally {
    // Hand the slot straight to the next waiter, so a new caller can't slip in between.
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

export type IconFetchResult = { ok: true } | { ok: false; reason: string };

const inFlight = new Map<string, Promise<IconFetchResult>>();

/** Fetches (or re-fetches) a shop's icon; joins a fetch already running for that shop. */
export function fetchShopIcon(shopId: string): Promise<IconFetchResult> {
  const running = inFlight.get(shopId);
  if (running) return running;
  const task = withSlot(() => runIconFetch(shopId)).finally(() => inFlight.delete(shopId));
  inFlight.set(shopId, task);
  return task;
}

/** Fire-and-forget fetches, e.g. after creating a shop or for shops without icon in a list. */
export function scheduleShopIcons(shopIds: string[]): void {
  for (const shopId of shopIds) {
    fetchShopIcon(shopId).catch((error: unknown) => console.error(`Shop icon fetch for ${shopId} failed`, error));
  }
}

async function runIconFetch(shopId: string): Promise<IconFetchResult> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { websiteUrl: true, icon: { select: { websiteUrl: true } } },
  });
  if (!shop) return { ok: false, reason: "Shop not found" };
  if (!shop.websiteUrl) {
    await db.shopIcon.deleteMany({ where: { shopId } });
    return { ok: false, reason: "No website" };
  }
  const websiteUrl = shop.websiteUrl;

  let result: IconFetchResult;
  let data: Omit<Prisma.ShopIconUncheckedCreateInput, "shopId">;
  const now = new Date();
  try {
    const icon = await discoverShopIcon(websiteUrl);
    result = { ok: true };
    data = {
      contentType: icon.contentType,
      data: new Uint8Array(icon.bytes),
      sourceUrl: icon.sourceUrl.slice(0, 1000),
      websiteUrl,
      fetchedAt: now,
      lastAttemptAt: now,
      failureReason: null,
    };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    result = { ok: false, reason };
    // Keep an earlier icon of the same website (better than nothing); drop one of a previous website.
    const stale = shop.icon !== null && shop.icon.websiteUrl !== websiteUrl;
    data = {
      websiteUrl,
      lastAttemptAt: now,
      failureReason: reason,
      ...(stale ? { contentType: null, data: null, sourceUrl: null, fetchedAt: null } : {}),
    };
  }

  // The website may have changed (or the shop been deleted) while we were fetching.
  const current = await db.shop.findUnique({ where: { id: shopId }, select: { websiteUrl: true } });
  if (!current) return { ok: false, reason: "Shop not found" };
  if (current.websiteUrl !== websiteUrl) return runIconFetch(shopId);

  await db.shopIcon.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
  return result;
}

// Serving ------------------------------------------------------------------------------------------------

export type StoredShopIcon = { contentType: string; bytes: Buffer; etag: string };

export async function loadShopIcon(shopId: string): Promise<StoredShopIcon | null> {
  const icon = await db.shopIcon.findUnique({ where: { shopId }, select: { contentType: true, data: true } });
  if (!icon?.data || !icon.contentType) return null;
  const bytes = Buffer.from(icon.data);
  const etag = `"${createHash("sha1").update(bytes).digest("hex").slice(0, 27)}"`;
  return { contentType: icon.contentType, bytes, etag };
}

/** Forget the icon (e.g. the website changed), so no stale logo shows while the new one is fetched. */
export async function clearShopIcon(shopId: string): Promise<void> {
  await db.shopIcon.deleteMany({ where: { shopId } });
}
