import webpush from "web-push";

/*
 * Web Push sending: a thin wrapper around the `web-push` package
 * ──────────────────────────────────────────────────────────────
 * Sending a push is one HTTPS POST to the subscription's endpoint (a URL of Google FCM, Mozilla, Apple or
 * Microsoft's push service) with:
 * - VAPID (RFC 8292): `Authorization: vapid t=<ES256 JWT>, k=<public key>`; the browser bound the subscription
 *   to our public key, so only we can push to it;
 * - the payload encrypted for that browser (RFC 8291, `Content-Encoding: aes128gcm`), so the push service never
 *   sees the content;
 * - `TTL` (how long an offline phone's message is kept), `Urgency` (high for the alarm) and `Topic` (a newer
 *   message with the same topic replaces an undelivered older one).
 *
 * `web-push` builds the request (keys, JWT, encryption, headers: `generateRequestDetails`); we send it with
 * `fetch` (a timeout, no redirects, injectable for tests). Nothing else in the app imports `web-push`.
 * Answers: 201 accepted; 404/410 the subscription is gone (delete it); 413 too large; 429/5xx try later.
 */

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushOptions = { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string };

export type PushResult =
  | { ok: true; status: number }
  /** `gone`: the subscription no longer exists (404/410): delete it. */
  | { ok: false; status: number | null; gone: boolean; error: string };

/** A new P-256 key pair, base64url (uncompressed public key, raw private key). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/** A Topic header value: at most 32 URL-safe base64 characters, derived from a tag. */
export const pushTopic = (tag: string) => Buffer.from(tag).toString("base64url").slice(0, 32);

/** Encrypts and POSTs one message. Never throws. */
export async function sendPush(
  target: PushTarget,
  payload: unknown,
  keys: VapidKeys,
  options: PushOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  let request: ReturnType<typeof webpush.generateRequestDetails>;
  try {
    request = webpush.generateRequestDetails({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
      vapidDetails: keys,
      TTL: options.ttlSeconds ?? 24 * 3600,
      urgency: options.urgency ?? "normal",
      ...(options.topic && { topic: options.topic }),
      contentEncoding: "aes128gcm",
    });
  } catch (error) {
    // Malformed keys or endpoint: the subscription can never work.
    return { ok: false, status: null, gone: true, error: errorText(error) };
  }
  try {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      // fetch sets Content-Length itself from the body.
      if (name.toLowerCase() !== "content-length") headers[name] = String(value);
    }
    const response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers,
      body: request.body ? new Uint8Array(request.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer().catch(() => undefined);
    if (response.ok) return { ok: true, status: response.status };
    return { ok: false, status: response.status, gone: response.status === 404 || response.status === 410, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: null, gone: false, error: errorText(error) };
  }
}

const errorText = (error: unknown) =>
  (error instanceof Error ? (error.name === "TimeoutError" ? "Timed out" : error.message) : "Failed").slice(0, 200);
