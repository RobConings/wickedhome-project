import { randomBytes } from "node:crypto";

/**
 * Webshop offers found by `recipes.find_product`, kept server-side for a while so `inventory.save_product` and
 * `recipes.save` take the product page link, price, photo and package size from here (by a short `offer` id)
 * instead of the model retyping them, and dropping or garbling them. Per household, in memory: an offer is only
 * meant for the same conversation, and a restart just means searching again.
 */

export type Offer = {
  shopId: string;
  shopName: string;
  /** The product's name on the shop's page. */
  name: string;
  /** The product page (from the page itself, never a search snippet). */
  url: string;
  priceCents: number | null;
  imageUrl: string | null;
  /** Content of one package read from the name ("200 g"), when there is one. */
  packageAmount: number | null;
  packageUnit: string | null;
};

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PER_HOUSEHOLD = 200;

const offers = new Map<string, { offer: Offer; expires: number }>();
const key = (householdId: string, id: string) => `${householdId}:${id}`;

/** Remembers an offer and returns its id ("of-k3x9q2"). */
export function rememberOffer(householdId: string, offer: Offer, now = Date.now()): string {
  for (const [entryKey, entry] of offers) if (entry.expires <= now) offers.delete(entryKey);
  const mine = [...offers.keys()].filter((entryKey) => entryKey.startsWith(`${householdId}:`));
  // The oldest go first when a household searched a lot.
  for (const entryKey of mine.slice(0, Math.max(0, mine.length - MAX_PER_HOUSEHOLD + 1))) offers.delete(entryKey);
  const id = `of-${randomBytes(4).toString("hex").slice(0, 6)}`;
  offers.set(key(householdId, id), { offer, expires: now + TTL_MS });
  return id;
}

/** The offer, or null when it is unknown, expired or another household's. */
export function getOffer(householdId: string, id: string, now = Date.now()): Offer | null {
  const entry = offers.get(key(householdId, id.trim()));
  if (!entry) return null;
  if (entry.expires <= now) {
    offers.delete(key(householdId, id.trim()));
    return null;
  }
  return entry.offer;
}

/** For tests. */
export function clearOffers() {
  offers.clear();
}
