import { xtraCredentialsSchema, type XtraCredentials } from "./xtra";

type ImportError = "invalid" | "noRequest" | "missingSession" | "multipleSessions";
export class XtraBrowserImportError extends Error {
  constructor(readonly code: ImportError) { super("The copied browser data could not be imported."); }
}
const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Read a filtered Chrome HAR entirely in the browser. Never execute it or forward the archive. */
export function importXtraBrowserData(text: string): XtraCredentials {
  if (text.length > 2_000_000) throw new XtraBrowserImportError("invalid");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new XtraBrowserImportError("invalid"); }
  const entries = record(record(raw)?.log)?.entries;
  if (!Array.isArray(entries) || entries.length > 500) throw new XtraBrowserImportError("invalid");
  let credentials: XtraCredentials | null = null, missingSession = false;
  for (const entry of entries) {
    const request = record(record(entry)?.request), response = record(record(entry)?.response);
    if (!request || request.method !== "GET" || response?.status !== 200 || typeof request.url !== "string") continue;
    let url: URL;
    try { url = new URL(request.url); } catch { continue; }
    const allowed = (url.origin === "https://apix.colruyt.be" && url.pathname === "/gateway/emec.colruyt.bffsvc/cg/latest-shopping-list") || (url.origin === "https://apip.colruyt.be" && url.pathname === "/gateway/emec.colruyt.protected.bffsvc/cg/nl/api/product-search-prs");
    if (!allowed || url.username || url.password) continue;
    const headers = new Map<string, string>();
    if (Array.isArray(request.headers)) for (const value of request.headers) {
      const header = record(value);
      if (typeof header?.name === "string" && typeof header.value === "string") headers.set(header.name.toLowerCase(), header.value);
    }
    const cookies = new Map<string, string>();
    if (Array.isArray(request.cookies)) for (const value of request.cookies) {
      const cookie = record(value);
      if (typeof cookie?.name === "string" && typeof cookie.value === "string") cookies.set(cookie.name, cookie.value);
    }
    for (const pair of (headers.get("cookie") ?? "").split(";")) {
      const separator = pair.indexOf("=");
      if (separator >= 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
    if (!cookies.get("clpbff_session")) { missingSession = true; continue; }
    const parsed = xtraCredentialsSchema.safeParse({ sessionId: cookies.get("clpbff_session"), apiKey: headers.get("x-cg-apikey"), placeId: url.searchParams.get("placeId"), reese84: cookies.get("reese84"), userAgent: headers.get("user-agent") });
    if (!parsed.success) throw new XtraBrowserImportError("invalid");
    if (credentials && (credentials.sessionId !== parsed.data.sessionId || credentials.apiKey !== parsed.data.apiKey || credentials.placeId !== parsed.data.placeId)) throw new XtraBrowserImportError("multipleSessions");
    credentials = parsed.data;
  }
  if (!credentials) throw new XtraBrowserImportError(missingSession ? "missingSession" : "noRequest");
  return credentials;
}
