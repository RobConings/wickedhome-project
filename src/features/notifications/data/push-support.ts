import type { PushSubscriptionInput } from "../types/notifications";

/*
 * The browser side of Web Push: can this device get notifications, and subscribing / unsubscribing.
 * - Android (Chrome, Edge, Samsung Internet, Firefox): works in the browser and in the installed app.
 * - iPhone / iPad: only in the app added to the home screen (iOS 16.4+), never in a Safari tab.
 * - Desktop browsers: work while the browser runs.
 * - Needs HTTPS (https://home.example.be) and the service worker (src/lib/pwa.ts).
 */

export type PushSupport =
  /** Ready: permission not asked yet, or granted. */
  | "available"
  /** iPhone/iPad in Safari: add to the home screen first. */
  | "ios-install"
  /** Notifications are blocked for this site in the browser or phone settings. */
  | "denied"
  /** Not over HTTPS (the LAN address): service workers and push don't exist there. */
  | "insecure"
  /** This browser has no Web Push. */
  | "unsupported";

/** Environment probes, injectable for stories and tests. */
export type PushEnvironment = {
  secure: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | null;
  ios: boolean;
  standalone: boolean;
};

export function readPushEnvironment(): PushEnvironment {
  if (typeof window === "undefined") {
    return { secure: false, hasServiceWorker: false, hasPushManager: false, hasNotification: false, permission: null, ios: false, standalone: false };
  }
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch tells them apart.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    secure: window.isSecureContext,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : null,
    ios,
    standalone,
  };
}

/** What this device can do. Pure, so the stories can show every case. */
export function pushSupportOf(env: PushEnvironment): PushSupport {
  if (!env.secure) return "insecure";
  if (env.ios && !env.standalone && (!env.hasPushManager || !env.hasNotification)) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return env.ios ? "ios-install" : "unsupported";
  if (env.permission === "denied") return "denied";
  return "available";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // pwa.ts registers on load; register here too in case that hasn't happened (first visit, slow load).
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** This browser's current push subscription endpoint, or null. */
export async function currentPushEndpoint(): Promise<string | null> {
  if (pushSupportOf(readPushEnvironment()) !== "available") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export class PushPermissionError extends Error {
  constructor(readonly permission: NotificationPermission) {
    super(`Notification permission: ${permission}`);
  }
}

/**
 * Asks for permission (call it from a click: browsers refuse prompts that aren't) and subscribes with the
 * server's public key. A subscription made with another key is replaced. Returns what the server stores.
 */
export async function subscribeToPush(publicKey: string): Promise<PushSubscriptionInput> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushPermissionError(permission);
  const reg = await registration();
  const key = base64UrlToBytes(publicKey);
  let subscription = await reg.pushManager.getSubscription();
  const currentKey = subscription?.options.applicationServerKey;
  if (subscription && currentKey && !sameBytes(new Uint8Array(currentKey), key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } };
}

/** Stops push on this browser (after the server forgot the device). */
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);

/** The browser's push abilities as the settings section uses them; stories pass a fake. */
export type PushBrowser = {
  support: () => PushSupport;
  currentEndpoint: () => Promise<string | null>;
  subscribe: (publicKey: string) => Promise<PushSubscriptionInput>;
  unsubscribe: () => Promise<void>;
};

export const browserPush: PushBrowser = {
  support: () => pushSupportOf(readPushEnvironment()),
  currentEndpoint: currentPushEndpoint,
  subscribe: subscribeToPush,
  unsubscribe: unsubscribeFromPush,
};
