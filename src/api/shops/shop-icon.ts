import { UnsafeUrlError, readLimited, readLimitedText, safeFetch } from "../lib/safe-fetch";

/*
 * Shop icons
 * ──────────
 * Finds a recognisable logo for a shop from its website, server-side, through the shared safe fetch (public
 * http/https only, redirects re-checked, timeouts and size caps):
 *
 * 1. Fetch the website's HTML (≤ 1 MB, 6 s) and collect `<link rel="apple-touch-icon">`, `<link rel="icon">`
 *    / `"shortcut icon"` (with `sizes`, `type`, `media`), the web app manifest and `og:image`.
 * 2. When the page offers no square raster of at least 64 px, read the manifest's `icons` too.
 * 3. Always add `/favicon.ico` as a fallback; `og:image` (usually a banner) only as the very last resort.
 * 4. Rank (see `scoreCandidate`) and try the best few in order. An icon must really be an image: the magic
 *    bytes must say PNG, JPEG, GIF, WebP, ICO or SVG (the stored content type comes from the bytes, not the
 *    server), and it must fit in 256 KB.
 *
 * Everything that parses HTML/JSON is a pure function, unit-tested in shop-icon.test.ts.
 */

export const MAX_ICON_BYTES = 256 * 1024;
const PAGE_TIMEOUT_MS = 6000;
const ICON_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_MANIFEST_BYTES = 200_000;
const MAX_REDIRECTS = 4;
/** Icon candidates tried per shop (plus /favicon.ico and og:image as fallbacks). */
const MAX_ATTEMPTS = 4;

const USER_AGENT = "Mozilla/5.0 (compatible; WickedHome/1.0; +shop icons)";
const BASE_HEADERS = { "User-Agent": USER_AGENT, "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8" };

export type IconSource = "apple-touch-icon" | "icon" | "manifest" | "favicon" | "og-image";
export type IconFormat = "png" | "svg" | "ico" | "jpeg" | "webp" | "gif" | "unknown";

export type IconCandidate = {
  url: string;
  source: IconSource;
  /** Largest declared size in px (the shorter side when not square); `Infinity` for `sizes="any"`; null when not declared. */
  size: number | null;
  /** False when every declared size is non-square (e.g. a 300x100 banner). */
  square: boolean;
  format: IconFormat;
  /** A manifest icon meant only as maskable (lots of padding). */
  maskable?: boolean;
};

export class IconNotFoundError extends Error {}

// Parsing ------------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeAttribute(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Attributes of one start tag, names lowercased, values decoded. First occurrence wins (like browsers). */
export function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const body = tag.replace(/^<\s*[a-z][\w-]*/i, "").replace(/\/?\s*>$/, "");
  for (const match of body.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1]?.toLowerCase();
    if (name && !attributes.has(name)) attributes.set(name, decodeAttribute(match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return attributes;
}

function absoluteHttpUrl(value: string | undefined, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Format from a `type` attribute, else from the URL's extension. */
export function iconFormat(type: string | undefined, url: string): IconFormat {
  const t = (type ?? "").toLowerCase();
  if (t.includes("svg")) return "svg";
  if (t.includes("png")) return "png";
  if (t.includes("icon")) return "ico";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpeg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return "unknown";
  }
  const extension = path.match(/\.(svg|png|ico|jpe?g|webp|gif)$/)?.[1];
  if (!extension) return "unknown";
  return extension === "jpg" ? "jpeg" : (extension as IconFormat);
}

/** `sizes="16x16 180x180"` → the largest square size; `"any"` → Infinity. */
export function parseSizes(value: string | undefined): { size: number | null; square: boolean } {
  let square: number | null = null;
  let other: number | null = null;
  for (const token of (value ?? "").toLowerCase().split(/\s+/)) {
    if (token === "any") {
      square = Infinity;
      continue;
    }
    const match = token.match(/^(\d+)x(\d+)$/);
    if (!match) continue;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width === height) square = Math.max(square ?? 0, width);
    else other = Math.max(other ?? 0, Math.min(width, height));
  }
  if (square !== null) return { size: square, square: true };
  if (other !== null) return { size: other, square: false };
  return { size: null, square: true };
}

export type PageIcons = {
  icons: IconCandidate[];
  manifestUrl: string | null;
  ogImageUrl: string | null;
};

/** Icon links, manifest and og:image from a page. Relative URLs resolve against `<base href>` or the page URL. */
export function parseIconCandidates(html: string, pageUrl: URL): PageIcons {
  // Commented-out markup and scripts (which may contain "<link" in strings) are not part of the page.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");

  let base = pageUrl;
  const baseTag = markup.match(/<base\s[^>]*>/i)?.[0];
  const baseHref = baseTag ? absoluteHttpUrl(parseAttributes(baseTag).get("href"), pageUrl) : null;
  if (baseHref) base = new URL(baseHref);

  const icons: IconCandidate[] = [];
  let manifestUrl: string | null = null;
  for (const [tag] of markup.matchAll(/<link\s[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const url = absoluteHttpUrl(attributes.get("href"), base);
    if (!url) continue;
    if (rel.includes("manifest")) {
      manifestUrl ??= url;
      continue;
    }
    const isTouchIcon = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!isTouchIcon && !rel.includes("icon")) continue;
    // A dark-mode-only icon is usually a light glyph: invisible on our white tile.
    if (/prefers-color-scheme\s*:\s*dark/i.test(attributes.get("media") ?? "")) continue;
    icons.push({
      url,
      source: isTouchIcon ? "apple-touch-icon" : "icon",
      ...parseSizes(attributes.get("sizes")),
      format: iconFormat(attributes.get("type"), url),
    });
  }

  let ogImageUrl: string | null = null;
  for (const [tag] of markup.matchAll(/<meta\s[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url") {
      ogImageUrl = absoluteHttpUrl(attributes.get("content"), base);
      if (ogImageUrl) break;
    }
  }

  return { icons: dedupe(icons), manifestUrl, ogImageUrl };
}

/** The `icons` of a web app manifest. Monochrome-only icons are skipped. */
export function parseManifestIcons(manifest: unknown, manifestUrl: URL): IconCandidate[] {
  const list = (manifest as { icons?: unknown } | null)?.icons;
  if (!Array.isArray(list)) return [];
  const icons: IconCandidate[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const { src, sizes, type, purpose } = entry as Record<string, unknown>;
    const url = absoluteHttpUrl(typeof src === "string" ? src : undefined, manifestUrl);
    if (!url) continue;
    const purposes = typeof purpose === "string" ? purpose.toLowerCase().split(/\s+/).filter(Boolean) : ["any"];
    if (!purposes.includes("any") && !purposes.includes("maskable")) continue;
    icons.push({
      url,
      source: "manifest",
      ...parseSizes(typeof sizes === "string" ? sizes : undefined),
      format: iconFormat(typeof type === "string" ? type : undefined, url),
      maskable: !purposes.includes("any"),
    });
  }
  return dedupe(icons);
}

function dedupe(candidates: IconCandidate[]): IconCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => !seen.has(candidate.url) && Boolean(seen.add(candidate.url)));
}

// Ranking ------------------------------------------------------------------------------------------------

/** Size to assume when none is declared: touch icons are 180 px, favicons 16–48 px. */
function assumedSize(candidate: IconCandidate): number | null {
  if (candidate.size !== null) return candidate.size;
  if (candidate.source === "apple-touch-icon") return 180;
  if (candidate.format === "ico" || candidate.source === "favicon") return 32;
  return null;
}

/**
 * Higher is better. Tiers: square raster ≥ 64 px (closest to ~192 px first) › SVG › raster of unknown size ›
 * small raster (bigger first) › og:image. Non-square and maskable-only icons are pushed down.
 *
 * Raster beats SVG on purpose: SVG favicons are often a bare glyph meant for a tab, or switch colours with
 * `prefers-color-scheme`, while touch/manifest icons are designed to stand alone on a tile.
 */
export function scoreCandidate(candidate: IconCandidate): number {
  if (candidate.source === "og-image") return 0;
  const size = assumedSize(candidate);
  let score: number;
  if (candidate.format === "svg") score = 800;
  else if (size === null || size === Infinity) score = 400;
  else if (size >= 64) score = 900 + 99 - Math.min(99, Math.round(Math.abs(Math.log2(size / 192)) * 40));
  else score = 100 + size;
  if (!candidate.square) score -= 900;
  if (candidate.maskable) score -= 50;
  return score;
}

/** Best first; ties keep document order. */
export const rankCandidates = (candidates: IconCandidate[]) =>
  candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate }) => candidate);

/** Square raster of at least 64 px: good enough that the manifest isn't worth fetching. */
const isGood = (candidate: IconCandidate) => scoreCandidate(candidate) >= 900;

/**
 * The order in which to try candidates: the best `MAX_ATTEMPTS`, then `/favicon.ico` of each origin if not
 * among them, then og:image.
 */
export function attemptOrder(icons: IconCandidate[], fallbacks: IconCandidate[], ogImageUrl: string | null): IconCandidate[] {
  const ranked = rankCandidates(dedupe([...icons, ...fallbacks]));
  const order = ranked.slice(0, MAX_ATTEMPTS);
  for (const fallback of fallbacks) if (!order.some((c) => c.url === fallback.url)) order.push(fallback);
  if (ogImageUrl && !order.some((c) => c.url === ogImageUrl)) {
    order.push({ url: ogImageUrl, source: "og-image", size: null, square: false, format: iconFormat(undefined, ogImageUrl) });
  }
  return order;
}

// Image checks -------------------------------------------------------------------------------------------

function looksLikeSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 4096).toString("utf8").replace(/^\uFEFF/, "");
  const rest = head.replace(/^(?:\s+|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, "");
  return /^<svg[\s>]/i.test(rest);
}

/** The image type the bytes really are (PNG, JPEG, GIF, WebP, ICO or SVG), or null. */
export function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 22 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
  if (looksLikeSvg(bytes)) return "image/svg+xml";
  return null;
}

// Fetching -----------------------------------------------------------------------------------------------

const errorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError") return "Timed out";
  // fetch() hides the useful part ("ECONNREFUSED", "UND_ERR_HEADERS_OVERFLOW"…) in `cause`.
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return error.message === "fetch failed" && cause ? `fetch failed (${cause.code ?? cause.message})` : error.message;
};

/**
 * The page's HTML. A branded "not found" page is still returned, because it usually carries the same icon
 * links; `status` tells the caller.
 */
async function fetchHtml(raw: string): Promise<{ url: URL; html: string; status: number }> {
  const { url, response } = await safeFetch(raw, {
    timeoutMs: PAGE_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    headers: { ...BASE_HEADERS, Accept: "text/html,application/xhtml+xml" },
  });
  // Bot walls (403, 429, 503…) carry no useful icons; a branded 404/410 page usually does.
  const usable = response.ok || response.status === 404 || response.status === 410;
  if (!usable || !(response.headers.get("content-type") ?? "").includes("html")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(response.ok ? "Not an HTML page" : `HTTP ${response.status}`);
  }
  return { url, html: await readLimitedText(response, MAX_HTML_BYTES), status: response.status };
}

async function fetchManifestIcons(raw: string): Promise<IconCandidate[]> {
  const { url, response } = await safeFetch(raw, {
    timeoutMs: ICON_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    headers: { ...BASE_HEADERS, Accept: "application/manifest+json,application/json" },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return [];
  }
  return parseManifestIcons(JSON.parse(await readLimitedText(response, MAX_MANIFEST_BYTES)), url);
}

export type FoundIcon = { contentType: string; bytes: Buffer; sourceUrl: string };

async function fetchImage(raw: string): Promise<FoundIcon> {
  const { url, response } = await safeFetch(raw, {
    timeoutMs: ICON_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    headers: { ...BASE_HEADERS, Accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon;q=0.9,*/*;q=0.5" },
  });
  const declared = (response.headers.get("content-type") ?? "").toLowerCase();
  const length = Number(response.headers.get("content-length") ?? 0);
  const problem = !response.ok
    ? `HTTP ${response.status}`
    : declared.includes("html") || declared.includes("javascript") || declared.includes("json")
      ? `Not an image (${declared.split(";")[0]})`
      : length > MAX_ICON_BYTES
        ? "Larger than 256 KB"
        : null;
  if (problem) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(problem);
  }
  const { bytes, truncated } = await readLimited(response, MAX_ICON_BYTES);
  if (truncated) throw new Error("Larger than 256 KB");
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error(bytes.length === 0 ? "Empty response" : "Not a recognised image");
  return { contentType, bytes, sourceUrl: url.toString() };
}

const faviconOf = (origin: string): IconCandidate => ({
  url: `${origin}/favicon.ico`,
  source: "favicon",
  size: null,
  square: true,
  format: "ico",
});

/**
 * Finds and downloads the best icon for a website. Throws `UnsafeUrlError` for a non-public URL and
 * `IconNotFoundError` (with a short reason) when nothing usable was found.
 */
export async function discoverShopIcon(websiteUrl: string): Promise<FoundIcon> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(websiteUrl);
  } catch {
    throw new IconNotFoundError("Invalid website URL");
  }

  const reasons: string[] = [];
  let page: PageIcons = { icons: [], manifestUrl: null, ogImageUrl: null };
  try {
    const fetched = await fetchHtml(websiteUrl);
    pageUrl = fetched.url;
    if (fetched.status >= 400) reasons.push(`page: HTTP ${fetched.status}`);
    page = parseIconCandidates(fetched.html, fetched.url);
    if (page.manifestUrl && !page.icons.some(isGood)) {
      page.icons.push(...(await fetchManifestIcons(page.manifestUrl).catch(() => [])));
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    reasons.push(`page: ${errorMessage(error)}`);
  }

  const origins = [...new Set([pageUrl.origin, new URL(websiteUrl).origin])];
  for (const candidate of attemptOrder(page.icons, origins.map(faviconOf), page.ogImageUrl)) {
    try {
      return await fetchImage(candidate.url);
    } catch (error) {
      const name = candidate.source === "favicon" ? "favicon.ico" : candidate.source;
      reasons.push(`${name}: ${errorMessage(error)}`);
    }
  }
  throw new IconNotFoundError(`No usable icon (${reasons.slice(0, 4).join("; ")})`.slice(0, 300));
}
