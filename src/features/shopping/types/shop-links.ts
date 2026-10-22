/**
 * A product's webshop link in the product form (docs/INVENTORY.md → "Webshop link"): which shop a pasted URL
 * belongs to, and which link is the product's main one. Pure, shared by the form and the API (shop-links.test.ts).
 */

/** "https://www.colruyt.be/nl/…" → "colruyt.be"; null for anything that isn't a URL. */
export function urlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * The shop whose website the URL is on (the same host, or a subdomain of it: "shop.colruyt.be" is Colruyt);
 * the most specific website wins. Catalogue shops count too. Null when none matches.
 */
export function shopForUrl<T extends { id: string; websiteUrl: string | null }>(url: string, shops: readonly T[]): T | null {
  const host = urlHost(url);
  if (!host) return null;
  let best: { shop: T; length: number } | null = null;
  for (const shop of shops) {
    const shopHost = urlHost(shop.websiteUrl);
    if (!shopHost || (host !== shopHost && !host.endsWith(`.${shopHost}`))) continue;
    if (!best || shopHost.length > best.length) best = { shop, length: shopHost.length };
  }
  return best?.shop ?? null;
}

/**
 * Where a pasted link is saved: the shop its URL belongs to (and that shop becomes the default shop when there is
 * none), else the default shop. `shopId` null: no shop matches and there is no default shop, so ask which shop.
 */
export function linkShopFor(
  url: string,
  shops: readonly { id: string; websiteUrl: string | null }[],
  defaultShopId: string | null,
): { shopId: string | null; setDefaultShop: boolean; matched: boolean } {
  const match = shopForUrl(url, shops);
  if (match) return { shopId: match.id, setDefaultShop: !defaultShopId, matched: true };
  return { shopId: defaultShopId, setDefaultShop: false, matched: false };
}

/** The product's main link: the default shop's (with a URL), else the first with a URL. */
export function mainShopLink<T extends { shopId: string; url: string | null }>(links: readonly T[], defaultShopId: string | null): T | null {
  const withUrl = links.filter((link) => link.url);
  return withUrl.find((link) => link.shopId === defaultShopId) ?? withUrl[0] ?? null;
}
