import type { AssistantWebStatus } from "@/features/assistant/types/assistant";
import { config } from "../lib/config";
import { readLimitedText } from "../lib/safe-fetch";
import { extractPage, extractPlainText, type ProductInfo, type RecipeInfo } from "./web-extract";
import { guardedGet, hostOf, internetTransport, PAGE_MAX_BYTES, WebFetchError, WEB_USER_AGENT, type PageTransport } from "./web-fetch";

/*
 * Web search and page reading for the assistant (ai/skills/web, ai/docs/WEB-SEARCH.md). Server-only.
 *
 * - Search goes to the household's own SearXNG (`SEARCH_URL`, e.g. http://127.0.0.1:8888, JSON output). That
 *   URL is set by the owner in .env, so it is trusted and may be on localhost; it is never taken from a model
 *   or a person.
 * - Reading a page goes through the SSRF guard in web-fetch.ts (public addresses only, pinned DNS, 3
 *   redirects, 10 s, 2 MB) and returns the title, product fields and trimmed text (web-extract.ts).
 * - Everything a page or a search result says is untrusted: the skill marks it so and the assistant's
 *   writes are confirmed by the person anyway.
 */

const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_MAX_BYTES = 2_000_000;
export const SEARCH_MAX_RESULTS = 8;
const DEFAULT_LANGUAGE = "nl-BE";

export type WebSearchProblem = "invalid_url";

export type WebSearchSettings = {
  /** Base URL of SearXNG, or null when not configured (or invalid). */
  url: string | null;
  /** SearXNG language code, e.g. `nl-BE`. */
  language: string;
  problem: WebSearchProblem | null;
};

export class WebSearchError extends Error {
  constructor(
    readonly code: "not_configured" | "unreachable" | "timeout" | "bad_response",
    message: string,
  ) {
    super(message);
  }
}

/** Where searches go: the internet via SearXNG, or a fake in tests and the eval (web-fake.ts). */
export type SearchTransport = (url: URL, signal: AbortSignal) => Promise<unknown>;

type Override = { search: SearchTransport; pages: PageTransport; searchUrl: string };
let override: Override | null = null;

/**
 * Tests and the eval only: send searches and page reads to fakes instead of the internet. While installed the
 * web tools count as configured (with `searchUrl`). `null` restores the real transports.
 */
export function setWebTransportsForTesting(next: Override | null): void {
  override = next;
}

const LANGUAGE = /^(all|auto|[a-z]{2,3}(-[A-Z]{2})?)$/;

export function readWebSettings(env: { SEARCH_URL?: string; SEARCH_LANGUAGE?: string } = config): WebSearchSettings {
  const language = env.SEARCH_LANGUAGE && LANGUAGE.test(env.SEARCH_LANGUAGE) ? env.SEARCH_LANGUAGE : DEFAULT_LANGUAGE;
  if (override) return { url: override.searchUrl, language, problem: null };
  const raw = env.SEARCH_URL?.trim();
  if (!raw) return { url: null, language, problem: null };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { url: null, language, problem: "invalid_url" };
    return { url: url.toString(), language, problem: null };
  } catch {
    return { url: null, language, problem: "invalid_url" };
  }
}

/** Web search is set up (the web skill is offered only then). */
export const isWebSearchConfigured = () => readWebSettings().url !== null;

// ── Search ──────────────────────────────────────────────────────────────────────────────────────────

export type WebSearchResult = {
  title: string;
  url: string;
  /** Host without `www.`. */
  domain: string;
  snippet: string | null;
  /** YYYY-MM-DD when the engine knows it (news, articles). */
  published: string | null;
};

export type WebSearchOptions = {
  limit?: number;
  language?: string;
  category?: "general" | "news" | "images" | "videos" | "it" | "science" | "map";
  /** Only results from this site: becomes ` site:<domain>` in the query. */
  site?: string | null;
  signal?: AbortSignal;
};

const bareHost = (url: URL) => hostOf(url).replace(/^www\./, "");

/** `https://www.gamma.be/nl/` or `www.Gamma.be` → `gamma.be`; null when it isn't a domain. */
export function siteDomain(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = bareHost(new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`));
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : null;
};

function publishedDay(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const internetSearch: SearchTransport = async (url, signal) => {
  let response: Response;
  try {
    response = await fetch(url, { signal, redirect: "error", headers: { Accept: "application/json", "User-Agent": WEB_USER_AGENT } });
  } catch {
    throw new WebSearchError(signal.aborted ? "timeout" : "unreachable", signal.aborted ? "The search took too long" : "The search server could not be reached");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new WebSearchError("bad_response", `The search server answered ${response.status}${response.status === 403 ? " (is the JSON format enabled in its settings.yml?)" : ""}`);
  }
  try {
    return JSON.parse(await readLimitedText(response, SEARCH_MAX_BYTES));
  } catch {
    throw new WebSearchError(signal.aborted ? "timeout" : "bad_response", signal.aborted ? "The search took too long" : "The search server sent an invalid answer");
  }
};

/** Searches the web via SearXNG: compact results, duplicates removed, at most 8. */
export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<{ query: string; results: WebSearchResult[]; failedEngines: string[] }> {
  const settings = readWebSettings();
  if (!settings.url) throw new WebSearchError("not_configured", "Web search is not configured (SEARCH_URL)");
  const site = siteDomain(options.site);
  const q = `${query.trim()}${site ? ` site:${site}` : ""}`;
  const base = settings.url.endsWith("/") ? settings.url : `${settings.url}/`;
  const url = new URL("search", base);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", options.language && LANGUAGE.test(options.language) ? options.language : settings.language);
  url.searchParams.set("categories", options.category ?? "general");
  url.searchParams.set("pageno", "1");

  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const search = override?.search ?? internetSearch;
  const data = (await search(url, signal)) as { results?: unknown; unresponsive_engines?: unknown } | null;
  if (!data || !Array.isArray(data.results)) throw new WebSearchError("bad_response", "The search server sent an invalid answer");

  const limit = Math.min(Math.max(options.limit ?? 5, 1), SEARCH_MAX_RESULTS);
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const entry of data.results as Record<string, unknown>[]) {
    if (results.length >= limit) break;
    let link: URL;
    try {
      link = new URL(String(entry?.url ?? ""));
    } catch {
      continue;
    }
    if (link.protocol !== "http:" && link.protocol !== "https:") continue;
    link.hash = "";
    const key = link.toString();
    if (seen.has(key) || key.length > 1000) continue;
    seen.add(key);
    results.push({
      title: clip(entry.title, 160) ?? bareHost(link),
      url: key,
      domain: bareHost(link),
      snippet: clip(entry.content, 280),
      published: publishedDay(entry.publishedDate ?? entry.pubdate),
    });
  }
  const failedEngines = Array.isArray(data.unresponsive_engines)
    ? data.unresponsive_engines.map((engine) => (Array.isArray(engine) ? String(engine[0]) : String(engine))).slice(0, 6)
    : [];
  return { query: q, results, failedEngines };
}

// ── Reading a page ──────────────────────────────────────────────────────────────────────────────────

export type WebPage = {
  /** The final URL after redirects. */
  url: string;
  domain: string;
  title: string | null;
  siteName: string | null;
  description: string | null;
  imageUrl: string | null;
  product: ProductInfo | null;
  /** The recipe when the page is one (schema.org Recipe): name, servings, ingredients, steps. */
  recipe: RecipeInfo | null;
  text: string;
  textCut: boolean;
  /** The page was larger than 2 MB and only its start was read. */
  partial: boolean;
  /** Why there is no text (a PDF, an image…), else null. */
  note: string | null;
};

export class WebPageError extends Error {
  constructor(
    readonly code: "blocked" | "http_error" | "not_text" | WebFetchError["code"],
    message: string,
  ) {
    super(message);
  }
}

function charsetOf(contentType: string, head: Buffer): string {
  const fromHeader = /charset\s*=\s*"?([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head.subarray(0, 4096).toString("latin1"))?.[1];
  return (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
}

function decode(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/**
 * Reads one web page through the SSRF guard: title, product data (price, shop, availability, EAN…), the
 * recipe on a recipe page and the main text trimmed to the budget. Throws `WebPageError` with a short reason
 * the model can pass on.
 */
export async function readPage(raw: string, options: { signal?: AbortSignal; language?: string } = {}): Promise<WebPage> {
  const language = options.language ?? readWebSettings().language;
  let opened: Awaited<ReturnType<typeof guardedGet>>;
  try {
    opened = await guardedGet(raw, {
      transport: override?.pages ?? internetTransport,
      signal: options.signal,
      headers: { "Accept-Language": `${language},${language.slice(0, 2)};q=0.9,en;q=0.7` },
    });
  } catch (error) {
    if (error instanceof WebFetchError) throw new WebPageError(error.code, error.message);
    throw error;
  }
  const { url, response, signal } = opened;
  const domain = hostOf(url).replace(/^www\./, "");
  if (response.status < 200 || response.status >= 300) {
    response.discard();
    if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 503) {
      throw new WebPageError("blocked", `${domain} refused automatic reading (HTTP ${response.status}); use the search snippet or give the link to the person`);
    }
    throw new WebPageError("http_error", `${domain} answered HTTP ${response.status}`);
  }
  const contentType = (response.headers["content-type"] ?? "").toLowerCase();
  const base = { url: url.toString(), domain, title: null, siteName: null, description: null, imageUrl: null, product: null, recipe: null, text: "", textCut: false, partial: false };
  if (contentType.includes("application/pdf")) {
    response.discard();
    return { ...base, note: "A PDF document: not read. Give the person the link." };
  }
  const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");
  const isText = contentType.startsWith("text/plain");
  if (!isHtml && !isText) {
    response.discard();
    throw new WebPageError("not_text", `Not a web page (${contentType.split(";")[0] || "unknown type"})`);
  }
  let body: { bytes: Buffer; truncated: boolean };
  try {
    body = await response.read(PAGE_MAX_BYTES);
  } catch {
    throw new WebPageError(signal.aborted ? "timeout" : "unreachable", signal.aborted ? `${domain} took too long to answer` : `${domain} broke off the connection`);
  }
  const text = decode(body.bytes, charsetOf(contentType, body.bytes));
  const page = isHtml ? extractPage(text, url) : extractPlainText(text);
  return { ...base, ...page, partial: body.truncated, note: null };
}

// ── Status (the assistant's card) ───────────────────────────────────────────────────────────────────

/** Host and port only, for the assistant's card (`web` in `GET /api/assistant/status`). */
export type WebSearchStatus = AssistantWebStatus;

let statusCache: { at: number; ok: boolean } | null = null;

/** Configured and reachable (a cheap `/healthz`, cached for a minute). Never includes more than the host. */
export async function webSearchStatus(settings: WebSearchSettings = readWebSettings(), timeoutMs = 2_500): Promise<WebSearchStatus> {
  const base = { configured: settings.url !== null, host: settings.url ? new URL(settings.url).host : null, problem: settings.problem };
  if (!settings.url) return { ...base, ok: null };
  if (override) return { ...base, ok: true };
  if (statusCache && Date.now() - statusCache.at < 60_000) return { ...base, ok: statusCache.ok };
  let ok: boolean;
  try {
    const response = await fetch(new URL("healthz", settings.url.endsWith("/") ? settings.url : `${settings.url}/`), { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    ok = response.ok;
    await response.body?.cancel().catch(() => undefined);
  } catch {
    ok = false;
  }
  statusCache = { at: Date.now(), ok };
  return { ...base, ok };
}
