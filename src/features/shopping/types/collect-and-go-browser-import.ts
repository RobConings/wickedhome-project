import { collectAndGoCartApiSchema, collectAndGoStateSchema, type CollectAndGoState } from "./collect-and-go";

/** Extract credentials from observed first-party cart/page requests; never execute or upload the HAR. */
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
  let cartApi: CollectAndGoState["cartApi"];
  for (const entry of entries) {
    const request = object(object(entry)?.request), response = object(object(entry)?.response);
    if (typeof request?.url !== "string") continue;
    let url: URL;
    try { url = new URL(request.url); } catch { continue; }
    if (url.username || url.password) continue;
    const apiPath = url.origin === "https://apip.collectandgo.be" ? url.pathname.match(/^\/gateway\/ecomfoodb2c\.eshop\.wcscartsvcv2\/v2\/store\/(\d{1,20})\/cart(?:\/@self)?$/) : null;
    const apiRequest = apiPath && ((request.method === "GET" && response?.status === 200) || (request.method === "POST" && response?.status === 201 && !url.pathname.endsWith("/@self")));
    const browserRequest = url.origin === "https://www.collectandgo.be" && url.pathname.startsWith("/nl/") && request.method === "GET" && response?.status === 200;
    if (!apiRequest && !browserRequest) continue;
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
    if (apiRequest) {
      const headers = new Map((Array.isArray(request.headers) ? request.headers : []).flatMap((value) => { const h = object(value); return typeof h?.name === "string" && typeof h.value === "string" ? [[h.name.toLowerCase(), h.value] as const] : []; }));
      const parsed = collectAndGoCartApiSchema.safeParse({ storeId: apiPath[1], catalogId: url.searchParams.get("catalogId"), langId: url.searchParams.get("langId"), authToken: headers.get("wcauthtoken"), apiKey: headers.get("x-cg-apikey") });
      if (!parsed.success || ![...values].some(([name, value]) => /^WC_AUTHENTICATION_\d+$/.test(name) && value)) throw invalid();
      if (cartApi && JSON.stringify(cartApi) !== JSON.stringify(parsed.data)) throw invalid();
      cartApi = parsed.data;
    }
    for (const [name, value] of values) {
      if (apiRequest && !/^(?:WC_AUTHENTICATION_\d+|WC_USERACTIVITY_\d+|WC_SESSION_ESTABLISHED|WC_ACTIVEPOINTER|WC_PERSISTENT|JSESSIONID|COL_RC|COL_SHOP|APP_C_LANGUAGE|reese84)$/.test(name)) continue;
      // No domain metadata is inferred from a Cookie header: restrict each credential to the host seen.
      const key = `${url.hostname}:${name}`;
      const previous = cookies.get(key);
      if (previous && previous.value !== value) throw invalid();
      cookies.set(key, { name, value, domain: url.hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" });
    }
  }
  if (cartApi && new Set([...cookies.values()].filter((cookie) => /^WC_AUTHENTICATION_\d+$/.test(cookie.name)).map((cookie) => cookie.name)).size !== 1) throw invalid();
  const parsed = collectAndGoStateSchema.safeParse({ cookies: [...cookies.values()], origins: [], ...(cartApi && { cartApi }), ...(userAgent && { userAgent }) });
  if (!parsed.success || !parsed.data.cookies.length) throw invalid();
  return parsed.data;
}
