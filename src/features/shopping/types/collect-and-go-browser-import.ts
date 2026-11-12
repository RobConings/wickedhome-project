import { collectAndGoStateSchema, type CollectAndGoState } from "./collect-and-go";

/** Import only same-host shop cookies from a successful normal-browser page, not the entire HAR. */
export function importCollectAndGoBrowserData(text: string): CollectAndGoState {
  const invalid = () => new Error("No valid Collect&Go browser session was found in the export.");
  if (text.length > 2_000_000) throw invalid();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw invalid(); }
  const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const entries = object(object(raw)?.log)?.entries;
  if (!Array.isArray(entries) || entries.length > 500) throw invalid();
  const cookies = new Map<string, CollectAndGoState["cookies"][number]>();
  let userAgent: string | undefined;
  for (const entry of entries) {
    const request = object(object(entry)?.request), response = object(object(entry)?.response);
    if (request?.method !== "GET" || response?.status !== 200 || typeof request.url !== "string") continue;
    let url: URL;
    try { url = new URL(request.url); } catch { continue; }
    if (url.origin !== "https://www.collectandgo.be" || url.username || url.password || !url.pathname.startsWith("/nl/")) continue;
    const content = object(response.content);
    if (typeof content?.mimeType !== "string" || !/^(text\/html|application\/json)(?:;|$)/i.test(content.mimeType)) continue;
    if (typeof content.text === "string" && /vermoeden dat je een bot was|access denied|suspected.*bot/i.test(content.text)) continue;
    const values = new Map<string, string>();
    if (Array.isArray(request.cookies)) for (const value of request.cookies) { const cookie = object(value); if (typeof cookie?.name === "string" && typeof cookie.value === "string") values.set(cookie.name, cookie.value); }
    if (Array.isArray(request.headers)) for (const value of request.headers) {
      const header = object(value);
      if (typeof header?.name === "string" && header.name.toLowerCase() === "user-agent" && typeof header.value === "string") userAgent = header.value;
      if (typeof header?.name !== "string" || header.name.toLowerCase() !== "cookie" || typeof header.value !== "string") continue;
      for (const pair of header.value.split(";")) { const at = pair.indexOf("="); if (at >= 0) values.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim()); }
    }
    for (const [name, value] of values) {
      // No domain metadata is inferred from a Cookie header: restrict each credential to the host seen.
      const previous = cookies.get(name);
      if (previous && previous.value !== value) throw invalid();
      cookies.set(name, { name, value, domain: url.hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" });
    }
  }
  const parsed = collectAndGoStateSchema.safeParse({ cookies: [...cookies.values()], origins: [], ...(userAgent && { userAgent }) });
  if (!parsed.success || !parsed.data.cookies.length) throw invalid();
  return parsed.data;
}
