import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import { isPublicAddress } from "../lib/safe-fetch";

/*
 * Fetching web pages the assistant chose (ai/docs/WEB-SEARCH.md "SSRF rules")
 * ──────────────────────────────────────────────────────────────────────────
 * The URL of `web.read` comes from a model that has just read untrusted web content, so it must never become
 * a way into the house: this server also runs Postgres, the speech server and (later) Home Assistant, and the
 * LAN has a router and a NAS. Every request therefore:
 *
 * - is http or https, on port 80 or 443, without credentials in the URL, to a host name with a dot or a
 *   literal IP (no `localhost`, `*.local`, `*.lan`, `*.internal`, `*.home.arpa`, single-label LAN names);
 * - resolves the host and refuses it unless EVERY address is public: no loopback, private, link-local,
 *   CGNAT, multicast, reserved, documentation, metadata (169.254.169.254) or IPv4-mapped/NAT64 IPv6 ranges
 *   (the shared list in src/api/lib/safe-fetch.ts);
 * - connects to exactly the address that was checked (the resolved address is pinned in the socket's
 *   lookup), so a DNS answer that changes between the check and the connection (rebinding) can't reach the
 *   LAN;
 * - follows at most 3 redirects by hand, each new URL checked again from the start;
 * - has one 10 s timeout for everything, reads at most 2 MB (after decompression), sends no cookies and keeps
 *   none, and names WickedHome in its User-Agent.
 *
 * The transport (DNS + one HTTP exchange) is replaceable so the tests and the eval never touch the internet
 * (web-fake.ts); the checks above live outside the transport and always run.
 */

export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_MAX_BYTES = 2_000_000;
export const PAGE_MAX_REDIRECTS = 3;
export const WEB_USER_AGENT = "Mozilla/5.0 (compatible; WickedHome/1.0; self-hosted household assistant)";

export type WebFetchErrorCode = "unsafe_url" | "blocked_address" | "not_found" | "too_many_redirects" | "timeout" | "unreachable";

/** A request that was refused or failed. The message is short and safe to show to the model. */
export class WebFetchError extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

/** One HTTP response whose body has not been read yet. */
export type OpenedResponse = {
  status: number;
  /** Lowercase names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  /** Reads (and decompresses) the body up to `maxBytes`; the rest is never downloaded. */
  read: (maxBytes: number) => Promise<{ bytes: Buffer; truncated: boolean }>;
  /** Drops the body without reading it. */
  discard: () => void;
};

/** DNS and one HTTP GET. The default goes to the internet; tests and the eval install a fake (web-fake.ts). */
export type PageTransport = {
  resolve: (host: string) => Promise<ResolvedAddress[]>;
  /** One GET of `url`, connecting only to `address` (already checked), no redirects followed. */
  open: (url: URL, address: ResolvedAddress, headers: Record<string, string>, signal: AbortSignal) => Promise<OpenedResponse>;
};

// ── URL and address checks ──────────────────────────────────────────────────────────────────────────

const LOCAL_SUFFIXES = [".localhost", ".local", ".lan", ".internal", ".intranet", ".home", ".home.arpa", ".localdomain", ".corp"];

/** The host of a URL without IPv6 brackets. */
export const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

/** Throws `WebFetchError("unsafe_url")` unless the URL may be fetched at all (before any DNS lookup). */
export function checkPageUrl(raw: string): URL {
  if (raw.length > 2000) throw new WebFetchError("unsafe_url", "The link is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebFetchError("unsafe_url", "Not a valid link");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebFetchError("unsafe_url", "Only http and https links can be read");
  if (url.username || url.password) throw new WebFetchError("unsafe_url", "Links with a user name or password are not read");
  if (url.port && url.port !== "80" && url.port !== "443") throw new WebFetchError("unsafe_url", "Only links on the standard ports (80, 443) are read");
  const host = hostOf(url);
  if (!host) throw new WebFetchError("unsafe_url", "The link has no host");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new WebFetchError("blocked_address", "Links to local or private addresses are not read");
    return url;
  }
  if (host === "localhost" || !host.includes(".") || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new WebFetchError("blocked_address", "Links to local network names are not read");
  }
  return url;
}

/**
 * The address to connect to: the literal IP, or the host's addresses, all of which must be public (one
 * private answer among public ones is refused too). IPv4 first: most homes have no IPv6 route.
 */
export async function safeAddressFor(url: URL, transport: PageTransport): Promise<ResolvedAddress> {
  const host = hostOf(url);
  const family = isIP(host);
  let addresses: ResolvedAddress[];
  if (family) {
    addresses = [{ address: host, family: family as 4 | 6 }];
  } else {
    try {
      addresses = await transport.resolve(host);
    } catch {
      throw new WebFetchError("not_found", `${host} does not exist or cannot be found`);
    }
  }
  if (!addresses.length) throw new WebFetchError("not_found", `${host} does not exist or cannot be found`);
  if (!addresses.every((entry) => isPublicAddress(entry.address))) {
    throw new WebFetchError("blocked_address", "Links that lead to local or private addresses are not read");
  }
  return addresses.find((entry) => entry.family === 4) ?? (addresses[0] as ResolvedAddress);
}

export type GuardedGetOptions = {
  transport?: PageTransport;
  /** The person stopped the answer: abort too. */
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
};

/**
 * GET with every check of the comment at the top. Returns the final URL and the response (any status but
 * a redirect); the caller checks the status and type and reads the body with `response.read(max)`. The
 * returned `signal` covers the body read too (the overall timeout).
 */
export async function guardedGet(raw: string, options: GuardedGetOptions = {}): Promise<{ url: URL; response: OpenedResponse; signal: AbortSignal }> {
  const transport = options.transport ?? internetTransport;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? PAGE_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const maxRedirects = options.maxRedirects ?? PAGE_MAX_REDIRECTS;
  const headers = {
    "User-Agent": WEB_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
    "Accept-Encoding": "gzip, deflate, br",
    ...options.headers,
  };
  let url = checkPageUrl(raw);
  for (let hop = 0; ; hop += 1) {
    const address = await safeAddressFor(url, transport);
    let response: OpenedResponse;
    try {
      response = await transport.open(url, address, headers, signal);
    } catch {
      if (signal.aborted) throw new WebFetchError("timeout", options.signal?.aborted ? "Stopped" : `${hostOf(url)} took too long to answer`);
      throw new WebFetchError("unreachable", `${hostOf(url)} could not be reached`);
    }
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      response.discard();
      if (hop >= maxRedirects) throw new WebFetchError("too_many_redirects", "The page redirects too often");
      let next: string;
      try {
        next = new URL(location, url).toString();
      } catch {
        throw new WebFetchError("unsafe_url", "The page redirects to an invalid link");
      }
      url = checkPageUrl(next);
      continue;
    }
    return { url, response, signal };
  }
}

// ── The internet transport: pinned DNS, node:http(s) ────────────────────────────────────────────────

async function resolveHost(host: string): Promise<ResolvedAddress[]> {
  const entries = await lookup(host, { all: true, verbatim: true });
  return entries.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
}

/** A socket lookup that always answers the checked address, whatever DNS says now. */
const pinnedLookup =
  (address: ResolvedAddress): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) (callback as unknown as (error: null, addresses: { address: string; family: number }[]) => void)(null, [address]);
    else callback(null, address.address, address.family);
  };

function decompressor(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/** Reads a stream up to `maxBytes`, then stops it (the rest is never downloaded). */
function readStream(stream: Readable, maxBytes: number, onDone: () => void): Promise<{ bytes: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      onDone();
      const bytes = Buffer.concat(chunks);
      resolve({ bytes: bytes.subarray(0, maxBytes), truncated });
    };
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.byteLength;
      if (size > maxBytes) finish(true);
    });
    stream.on("end", () => finish(false));
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      onDone();
      reject(error instanceof Error ? error : new Error("The connection closed early"));
    };
    stream.on("error", fail);
    // Aborted (timeout, stop) without an error event: never hang.
    stream.on("close", () => fail(null));
  });
}

export const internetTransport: PageTransport = {
  resolve: resolveHost,
  open: (url, address, headers, signal) =>
    new Promise((resolve, reject) => {
      const client = url.protocol === "https:" ? https : http;
      const request = client.request(
        {
          protocol: url.protocol,
          hostname: hostOf(url),
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers,
          signal,
          // A fresh connection each time, always to the pinned address (no shared keep-alive sockets).
          agent: false,
          lookup: pinnedLookup(address),
        },
        (response) => {
          const flat: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) flat[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
          }
          const stop = () => response.destroy();
          resolve({
            status: response.statusCode ?? 0,
            headers: flat,
            discard: stop,
            read: (maxBytes) => {
              const inflate = decompressor(flat["content-encoding"]);
              if (!inflate) return readStream(response, maxBytes, stop);
              response.on("error", (error) => inflate.destroy(error));
              response.pipe(inflate);
              return readStream(inflate, maxBytes, () => {
                inflate.destroy();
                stop();
              });
            },
          });
        },
      );
      request.on("error", reject);
      request.end();
    }),
};
