import { readLimitedText, safeFetch } from "../lib/safe-fetch";

export { UnsafeUrlError, assertSafeUrl, isPublicAddress } from "../lib/safe-fetch";

/*
 * Webshop link previews
 * ─────────────────────
 * Pasting a product URL fetches the page server-side and reads its title, image and price from
 * OpenGraph tags and JSON-LD (schema.org Product). The fetch goes through the shared safe fetch
 * (`src/api/lib/safe-fetch.ts`): http/https on default ports only, every resolved address must be public,
 * redirects followed by hand (max 3) and checked again, 5 s timeout overall and at most 1.5 MB of HTML read.
 */

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

/** Fetches an HTML page safely (see the comment above). Returns the final URL and the HTML. */
export async function fetchPage(raw: string): Promise<{ url: URL; html: string }> {
  const { url, response } = await safeFetch(raw, {
    timeoutMs: TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WickedHome/1.0; +link preview)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${response.status}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("html")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Not an HTML page");
  }
  return { url, html: await readLimitedText(response, MAX_BYTES) };
}

// Parsing ------------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    const key = attr("property") ?? attr("name") ?? attr("itemprop");
    const content = attr("content");
    const keyText = (key?.[2] ?? key?.[3])?.toLowerCase();
    const contentText = content?.[2] ?? content?.[3];
    if (keyText && contentText !== undefined && !tags.has(keyText)) tags.set(keyText, decodeEntities(contentText).trim());
  }
  return tags;
}

/** "12.99", "12,99", "1.299,00", "€ 12" → cents. */
export function priceToCents(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[^\d.,]/g, "");
  if (!text) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const grouping = decimal === "," ? "." : ",";
  text = text.replaceAll(grouping, "").replace(decimal, ".");
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

type ProductData = { name?: string; image?: string; price?: number | null };

/** Walks JSON-LD blocks for a schema.org Product. */
function jsonLdProduct(html: string): ProductData | null {
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(body?.trim() ?? "");
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      const type = record["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (isProduct) {
        const image = Array.isArray(record.image) ? record.image[0] : record.image;
        const imageUrl = typeof image === "string" ? image : (image as { url?: string } | undefined)?.url;
        const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
        const offer = offers as Record<string, unknown> | undefined;
        const price = priceToCents(offer?.price ?? offer?.lowPrice);
        return {
          name: typeof record.name === "string" ? decodeEntities(record.name) : undefined,
          image: typeof imageUrl === "string" ? imageUrl : undefined,
          price,
        };
      }
      if (record["@graph"]) queue.push(record["@graph"]);
    }
  }
  return null;
}

function absoluteHttpUrl(value: string | undefined, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

export type PageMetadata = { title: string | null; imageUrl: string | null; priceCents: number | null };

/** Title, image and price from a product page's OpenGraph tags, JSON-LD and `<title>`. */
export function parsePageMetadata(html: string, base: URL): PageMetadata {
  const meta = metaTags(html);
  const product = jsonLdProduct(html);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = product?.name ?? meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decodeEntities(titleTag) : undefined);
  const price =
    product?.price ??
    priceToCents(meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price"));
  return {
    title: title?.replace(/\s+/g, " ").trim().slice(0, 120) || null,
    imageUrl: absoluteHttpUrl(product?.image ?? meta.get("og:image") ?? meta.get("twitter:image"), base),
    priceCents: price ?? null,
  };
}

/** Host without `www.`, lowercase, for matching a URL to a shop's website. */
export const bareHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
