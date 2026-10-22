import { config, isProduction } from "../lib/config";
import { db } from "../lib/db";
import { getVapid } from "./vapid-keys";
import { sendPush, type PushOptions, type PushResult, type PushTarget, type VapidKeys } from "./web-push";

/*
 * Pushing one message to all of a person's devices, and keeping the subscription list clean:
 * - success: `lastSuccessAt`, the failure count back to 0;
 * - 404/410 (or a subscription whose keys can't work): the browser dropped it, so the row is deleted;
 * - anything else (5xx, 429, timeouts): `failureCount` + 1 and the reason, kept for a later message.
 */

export type PushPayload = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  tag: string | null;
  urgent: boolean;
  /** Unread count after this one, for the app icon badge. */
  unread: number;
};

export type SubscriptionRow = PushTarget & { id: string };

export type PushStore = {
  listSubscriptions(userId: string): Promise<SubscriptionRow[]>;
  succeeded(id: string, at: Date): Promise<void>;
  failed(id: string, at: Date, error: string): Promise<void>;
  remove(id: string): Promise<void>;
};

export type PushSender = (target: PushTarget, payload: unknown, keys: VapidKeys, options: PushOptions) => Promise<PushResult>;

export type PushOutcome = { sent: number; failed: number; removed: number };

/** Hosts of the browsers' push services. The server POSTs only to these (an endpoint comes from a browser). */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
];

/** Whether the server may send to this endpoint: https on a known push service (or a local fake in runtime checks). */
export function isAllowedPushEndpoint(endpoint: string, allowLocal = config.WEB_PUSH_ALLOW_LOCAL_ENDPOINTS && !isProduction): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (allowLocal && url.protocol === "http:" && url.hostname === "127.0.0.1") return true;
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export async function pushToSubscriptions(
  userId: string,
  payload: PushPayload,
  options: PushOptions,
  deps: { store: PushStore; send: PushSender; keys: VapidKeys; now?: () => Date },
): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, failed: 0, removed: 0 };
  const now = deps.now ?? (() => new Date());
  for (const subscription of await deps.store.listSubscriptions(userId)) {
    const result = await deps.send(subscription, payload, deps.keys, options);
    if (result.ok) {
      outcome.sent += 1;
      await deps.store.succeeded(subscription.id, now());
    } else if (result.gone) {
      outcome.removed += 1;
      await deps.store.remove(subscription.id);
    } else {
      outcome.failed += 1;
      await deps.store.failed(subscription.id, now(), result.error);
    }
  }
  return outcome;
}

export const prismaPushStore: PushStore = {
  listSubscriptions: (userId) => db.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true } }),
  succeeded: async (id, at) => {
    await db.pushSubscription.updateMany({ where: { id }, data: { lastSuccessAt: at, failureCount: 0, lastError: null } });
  },
  failed: async (id, at, error) => {
    await db.pushSubscription.updateMany({ where: { id }, data: { failureCount: { increment: 1 }, lastFailureAt: at, lastError: error.slice(0, 200) } });
  },
  remove: async (id) => {
    await db.pushSubscription.deleteMany({ where: { id } });
  },
};

/** Sends to every device of one person, with the server's keys. */
export async function pushToUser(userId: string, payload: PushPayload, options: PushOptions): Promise<PushOutcome> {
  const { keys } = await getVapid();
  const send: PushSender = (target, body, vapid, pushOptions) =>
    isAllowedPushEndpoint(target.endpoint)
      ? sendPush(target, body, vapid, pushOptions)
      : Promise.resolve({ ok: false, status: null, gone: true, error: "Endpoint not allowed" });
  return pushToSubscriptions(userId, payload, options, { store: prismaPushStore, send, keys });
}
