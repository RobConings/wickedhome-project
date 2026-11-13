import { collectAndGoStateSchema, type CollectAndGoState } from "@/features/shopping/types/collect-and-go";

type Cookie = CollectAndGoState["cookies"][number];
const apiHost = "apip.collectandgo.be";
const sessionName = /^(?:WC_AUTHENTICATION_\d+|WC_USERACTIVITY_\d+|WC_SESSION_ESTABLISHED|WC_ACTIVEPOINTER|WC_PERSISTENT|JSESSIONID|COL_RC|COL_SHOP|APP_C_LANGUAGE)$/;
const domainKey = (domain: string) => domain.replace(/^\./, "");
const key = (cookie: Cookie) => `${domainKey(cookie.domain)}:${cookie.path}:${cookie.name}`;
const pathMatches = (path: string, cookiePath: string) => path === cookiePath || path.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);

/** Only first-party cookies applicable to this exact HTTPS API request. */
export function collectAndGoRequestCookies(state: CollectAndGoState, url: URL, now = Date.now()): Cookie[] {
  if (url.origin !== `https://${apiHost}`) return [];
  return state.cookies.filter(cookie => cookie.value && (sessionName.test(cookie.name) || cookie.name === "reese84")
    && [apiHost, "collectandgo.be"].includes(domainKey(cookie.domain))
    && pathMatches(url.pathname, cookie.path) && (cookie.expires < 0 || cookie.expires * 1000 > now))
    .sort((a, b) => b.path.length - a.path.length || Number(domainKey(b.domain) === apiHost) - Number(domainKey(a.domain) === apiHost));
}

/** Maintain ordinary server-issued session cookies, without inventing login/refresh requests.
 * Call only after the response has proved access to the requested account's basket/order.
 * Challenge responses and their cookies must never reach this function.
 */
export function renewCollectAndGoCookies(state: CollectAndGoState, url: URL, headers: Headers, now = Date.now()): void {
  if (url.origin !== `https://${apiHost}`) return;
  // The old cookie may expire while a request is in flight. Its verified response can still renew it.
  const accountNames = new Set(collectAndGoRequestCookies(state, url, 0).flatMap(cookie => /^WC_AUTHENTICATION_(\d+)$/.exec(cookie.name)?.[1] ?? []));
  if (accountNames.size !== 1) return;
  const account = [...accountNames][0];
  const next = new Map(state.cookies.map(cookie => [key(cookie), cookie]));
  let changed = false;
  // getSetCookie preserves separate headers, including commas inside Expires.
  for (const header of headers.getSetCookie().slice(0, 100)) {
    if (header.length > 18000 || header.includes("\0") || /[\r\n]/.test(header)) continue;
    const parts = header.split(";"), pair = parts.shift()!, equals = pair.indexOf("=");
    if (equals <= 0) continue;
    const name = pair.slice(0, equals).trim(), value = pair.slice(equals + 1).trim();
    if (!sessionName.test(name) || !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(value)) continue;
    const owner = /^WC_(?:AUTHENTICATION|USERACTIVITY)_(\d+)$/.exec(name)?.[1];
    if (owner && owner !== account) continue;
    const attributes = new Map(parts.map(part => { const at = part.indexOf("="); return at < 0 ? [part.trim().toLowerCase(), ""] : [part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim()]; }));
    const domain = attributes.get("domain")?.toLowerCase().replace(/^\./, "") ?? apiHost;
    if (![apiHost, "collectandgo.be"].includes(domain)) continue;
    const defaultPath = url.pathname.slice(0, url.pathname.lastIndexOf("/")) || "/";
    const path = attributes.get("path") ?? defaultPath;
    if (!pathMatches(url.pathname, path)) continue;
    let expires = -1;
    const maxAge = attributes.get("max-age");
    if (maxAge !== undefined) {
      if (!/^-?\d+$/.test(maxAge) || !Number.isSafeInteger(Number(maxAge))) continue;
      expires = Number(maxAge) <= 0 ? 0 : Math.min(253402300799, now / 1000 + Number(maxAge));
    } else if (attributes.has("expires")) {
      const date = Date.parse(attributes.get("expires")!);
      if (!Number.isFinite(date)) continue;
      expires = Math.max(0, date / 1000);
    }
    const sameSite = attributes.get("samesite")?.toLowerCase();
    const cookie = { name, value, domain: domain === "collectandgo.be" ? ".collectandgo.be" : apiHost, path, expires, httpOnly: attributes.has("httponly"), secure: attributes.has("secure"), sameSite: sameSite === "strict" ? "Strict" : sameSite === "none" ? "None" : "Lax" } as const;
    if (!collectAndGoStateSchema.shape.cookies.element.safeParse(cookie).success) continue;
    const id = key(cookie);
    // A HAR Cookie header has no domain metadata and is imported as host-scoped.
    // Replace that narrower alias when the server establishes the real parent domain.
    if (domain === "collectandgo.be") changed = next.delete(`${apiHost}:${path}:${name}`) || changed;
    if (!value || (expires >= 0 && expires * 1000 <= now)) {
      changed = next.delete(id) || changed;
    } else if (JSON.stringify(next.get(id)) !== JSON.stringify(cookie) && (next.has(id) || next.size < 500)) {
      next.set(id, cookie); changed = true;
    }
  }
  if (changed) state.cookies = [...next.values()];
}
