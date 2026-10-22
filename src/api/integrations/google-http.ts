import { readLimited, readLimitedText } from "../lib/safe-fetch";
import { OUTBOUND_USER_AGENT } from "../lib/fixed-host-fetch";

/*
 * Outbound requests to Google. The URLs are built by our own code, so like `fixed-host-fetch` this only
 * reaches an allow-list of Google hosts over https, never follows redirects, has one timeout for request and
 * body, and caps bodies. Error messages are short and never contain tokens, URLs with queries or mail content.
 *
 * `fetch` is injectable (`setGoogleFetch`) so tests and local runtime checks can talk to a fake Google.
 */

export const GOOGLE_HOSTS = [
  "accounts.google.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",
  "gmail.googleapis.com",
] as const;

type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);

/** Replaces the fetch used for every Google request (tests, fakes). Returns the previous one. */
export function setGoogleFetch(next: FetchLike): FetchLike {
  const previous = fetchImpl;
  fetchImpl = next;
  return previous;
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    /** HTTP status when Google answered, else `null` (timeout, network). */
    readonly status: number | null = null,
    /** Google's error code (`invalid_grant`, `rateLimitExceeded`…) when the body said one. */
    readonly reason: string | null = null,
  ) {
    super(message);
  }
}

export type GoogleRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | URLSearchParams;
  timeoutMs?: number;
  /** Combined with the timeout (a job's signal). */
  signal?: AbortSignal;
};

/** Short description of a URL for messages: host and path, no query (queries can hold mail searches). */
const where = (url: URL) => `${url.hostname}${url.pathname.replace(/\/[^/]{24,}/g, "/…")}`;

/** Sends a request to an allowed Google host. Returns the unread response for any status; never follows redirects. */
export async function googleRequest(raw: string | URL, { method = "GET", accessToken, headers, body, timeoutMs = 20_000, signal }: GoogleRequest = {}): Promise<Response> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !(GOOGLE_HOSTS as readonly string[]).includes(url.hostname)) {
    throw new GoogleApiError(`Host not allowed: ${url.hostname}`);
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImpl(url, {
      method,
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        "User-Agent": OUTBOUND_USER_AGENT,
        Accept: "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...headers,
      },
      body: body === undefined || typeof body === "string" || body instanceof URLSearchParams ? body : new Uint8Array(body),
    });
  } catch (error) {
    const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timed out" : "unreachable";
    throw new GoogleApiError(`${where(url)} ${reason}`);
  }
}

/** Google's error code from a JSON error body (OAuth `{error}` or API `{error:{status, errors:[{reason}]}}`). */
function errorReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = error as { status?: unknown; errors?: { reason?: unknown }[] };
    const reason = nested.errors?.[0]?.reason;
    if (typeof reason === "string") return reason;
    if (typeof nested.status === "string") return nested.status;
  }
  return null;
}

/** Throws a `GoogleApiError` for a non-2xx response (reading a small part of the body for Google's reason). */
export async function assertOk(response: Response, url: string | URL): Promise<void> {
  if (response.ok) return;
  let reason: string | null = null;
  try {
    reason = errorReason(JSON.parse(await readLimitedText(response, 20_000)));
  } catch {
    // Not JSON; the status says enough.
  }
  throw new GoogleApiError(`${where(new URL(url))} answered ${response.status}${reason ? ` (${reason})` : ""}`, response.status, reason);
}

/** A JSON request to Google; throws `GoogleApiError` on any failure. */
export async function googleJson<T>(url: string | URL, request: GoogleRequest & { maxBytes?: number } = {}): Promise<T> {
  const response = await googleRequest(url, request);
  await assertOk(response, url);
  if (response.status === 204) return undefined as T;
  const text = await readLimitedText(response, request.maxBytes ?? 5_000_000);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GoogleApiError(`${where(new URL(url))} sent invalid JSON`, response.status);
  }
}

/** Downloads a binary body up to `maxBytes`; throws when larger. */
export async function googleBytes(url: string | URL, request: GoogleRequest & { maxBytes: number }): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await googleRequest(url, request);
  await assertOk(response, url);
  if (Number(response.headers.get("content-length") ?? 0) > request.maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new GoogleApiError(`${where(new URL(url))} sent more than ${request.maxBytes} bytes`, response.status, "too_large");
  }
  const { bytes, truncated } = await readLimited(response, request.maxBytes);
  if (truncated) throw new GoogleApiError(`${where(new URL(url))} sent more than ${request.maxBytes} bytes`, response.status, "too_large");
  return { bytes, contentType: (response.headers.get("content-type") ?? "").toLowerCase() };
}
