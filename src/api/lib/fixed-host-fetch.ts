import { readLimited, readLimitedText } from "./safe-fetch";

/*
 * Outbound requests to a fixed, known set of third-party hosts (weather, geocoding, waste collectors).
 * Unlike `safeFetch` (user-supplied URLs), the URL is built by our own code, so the checks here are simpler:
 *
 * - the host must be on the caller's allow-list and the scheme https;
 * - redirects are not followed (an API that starts redirecting is treated as an error);
 * - one timeout covers the request and reading the body, and bodies are read up to a cap;
 * - errors carry a short, non-personal message (never the full URL, which can contain an address).
 */

export class OutboundError extends Error {
  constructor(
    message: string,
    /** HTTP status when the host answered, else `null` (timeout, network, bad body). */
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export type FixedHostRequest = {
  /** Hosts this call may reach, e.g. `["api.open-meteo.com"]`. */
  allowedHosts: readonly string[];
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Non-2xx statuses whose body is still read and returned (e.g. an API that answers 404 with a JSON reason). */
  acceptStatuses?: readonly number[];
};

/** Identifies WickedHome to public APIs, as Nominatim's and Open-Meteo's usage policies ask. */
export const OUTBOUND_USER_AGENT = "WickedHome/1.0 (self-hosted household app)";

async function openFixedHost(
  raw: string,
  { allowedHosts, method = "GET", headers, body, timeoutMs = 10_000, acceptStatuses = [] }: FixedHostRequest,
): Promise<{ url: URL; response: Response; signal: AbortSignal }> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname)) {
    throw new OutboundError(`Host not allowed: ${url.hostname}`);
  }
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      body,
      redirect: "manual",
      signal,
      headers: { "User-Agent": OUTBOUND_USER_AGENT, Accept: "application/json", ...headers },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new OutboundError(`${url.hostname} ${reason}`);
  }
  if (!response.ok && !acceptStatuses.includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    throw new OutboundError(`${url.hostname} answered ${response.status}`, response.status);
  }
  return { url, response, signal };
}

async function fetchFromFixedHost(raw: string, request: FixedHostRequest): Promise<string> {
  const { url, response, signal } = await openFixedHost(raw, request);
  try {
    return await readLimitedText(response, request.maxBytes ?? 2_000_000);
  } catch {
    throw new OutboundError(`${url.hostname} ${signal.aborted ? "timed out" : "sent an unreadable response"}`);
  }
}

/**
 * Downloads a binary body (e.g. an image) from an allowed host. Throws `OutboundError` when it fails or is
 * larger than `maxBytes` (the rest is never downloaded). The caller checks what the bytes really are.
 */
export async function fetchBytesFromFixedHost(raw: string, request: FixedHostRequest): Promise<{ bytes: Buffer; contentType: string }> {
  const { url, response, signal } = await openFixedHost(raw, request);
  const maxBytes = request.maxBytes ?? 2_000_000;
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new OutboundError(`${url.hostname} sent a body over ${maxBytes} bytes`);
  }
  let result: Awaited<ReturnType<typeof readLimited>>;
  try {
    result = await readLimited(response, maxBytes);
  } catch {
    throw new OutboundError(`${url.hostname} ${signal.aborted ? "timed out" : "sent an unreadable response"}`);
  }
  if (result.truncated) throw new OutboundError(`${url.hostname} sent a body over ${maxBytes} bytes`);
  return { bytes: result.bytes, contentType: (response.headers.get("content-type") ?? "").toLowerCase() };
}

/** Fetches JSON from an allowed host. Throws `OutboundError` on any failure, including invalid JSON. */
export async function fetchJsonFromFixedHost<T = unknown>(url: string, request: FixedHostRequest): Promise<T> {
  const text = await fetchFromFixedHost(url, request);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OutboundError(`${new URL(url).hostname} sent invalid JSON`);
  }
}
