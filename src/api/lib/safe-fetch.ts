import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/*
 * Safe server-side fetching of user-supplied URLs
 * ───────────────────────────────────────────────
 * Used by webshop link previews and shop icons. Because the server fetches a URL a user typed, it must
 * never become a way to reach the LAN (Home Assistant, the router, Postgres…):
 *
 * - only http/https on the default ports, no credentials in the URL;
 * - the host name is resolved and every address must be public (no private, loopback, link-local,
 *   CGNAT, multicast or IPv4-mapped ranges); literal IPs are checked the same way;
 * - redirects are followed by hand (a few hops), each hop checked again;
 * - one timeout covers the whole request including reading the body, and bodies are read up to a cap.
 *
 * Known gap: DNS could change between our check and the connection (rebinding). Acceptable for a
 * household app behind a login; pinning the resolved address would need a custom HTTP agent.
 */

// Two lists on purpose: Node's BlockList also matches an IPv4 address against IPv6 rules via its
// IPv4-mapped form, so the `::ffff:0:0/96` rule below would block every IPv4 address in a shared list.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

export class UnsafeUrlError extends Error {}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !blockedV4.check(address, "ipv4") : !blockedV6.check(address, "ipv6");
}

/** Throws `UnsafeUrlError` unless the URL is http(s) and its host resolves only to public addresses. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https");
  if (url.username || url.password) throw new UnsafeUrlError("No credentials in links");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Only default ports");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".lan")) {
    throw new UnsafeUrlError("Local host");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) throw new UnsafeUrlError("Not a public address");
  return url;
}

export type SafeFetchOptions = {
  /** Covers every hop and reading the body (when read through `readLimited`). */
  timeoutMs: number;
  maxRedirects: number;
  headers?: Record<string, string>;
};

/**
 * Fetches a URL with the checks described at the top: every hop is validated and redirects are followed
 * by hand. Returns the final URL and the (unread) response for any non-redirect status; the caller checks
 * `response.ok` and the content type, and reads the body with `readLimited`.
 */
export async function safeFetch(raw: string, { timeoutMs, maxRedirects, headers }: SafeFetchOptions): Promise<{ url: URL; response: Response }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = await assertSafeUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetch(url, { redirect: "manual", signal, headers });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error("Redirect without location");
      url = await assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    return { url, response };
  }
  throw new Error("Too many redirects");
}

/**
 * Reads at most `maxBytes` of a response body. `truncated` is true when the body was longer (the rest is
 * not downloaded).
 */
export async function readLimited(response: Response, maxBytes: number): Promise<{ bytes: Buffer; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: Buffer.alloc(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  while (size <= maxBytes) {
    const { done, value } = await reader.read();
    if (done) {
      complete = true;
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  if (!complete) await reader.cancel().catch(() => undefined);
  const bytes = Buffer.concat(chunks);
  return { bytes: bytes.subarray(0, maxBytes), truncated: !complete && bytes.byteLength > maxBytes };
}

/** Reads a text body (UTF-8, lenient) up to `maxBytes`, silently cutting off the rest. */
export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const { bytes } = await readLimited(response, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
