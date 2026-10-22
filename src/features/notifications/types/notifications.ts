import { z } from "zod";

/**
 * Notifications (docs/NOTIFICATIONS.md): the in-app notification center and Web Push to phones. Features
 * send them through `notify()` in src/api/notifications; this file is the contract shared by that API and
 * the UI (bell, /notifications, Settings → Notifications). Pure, runs in Node and the browser.
 */

/** Live event on the household stream when someone's notifications changed (new, read). */
export const NOTIFICATIONS_CHANGED_EVENT = "notification.changed";
export type NotificationsChangedEvent = { userIds: string[] };

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  /** In-app path to open; null: nothing more to open. */
  url: z.string().nullable(),
  urgent: z.boolean(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const NOTIFICATIONS_PAGE_SIZE = 50;
/** How long notifications are kept (job `notifications.prune`). */
export const NOTIFICATION_RETENTION_DAYS = 90;

export const notificationsQuerySchema = z.object({
  /** The `nextCursor` of the previous page. */
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(NOTIFICATIONS_PAGE_SIZE),
});
export type NotificationsQuery = z.input<typeof notificationsQuerySchema>;

export type NotificationsPage = {
  items: NotificationItem[];
  unread: number;
  nextCursor: string | null;
};

export const markReadInputSchema = z.object({
  /** Notifications to mark read; omitted: all of them. */
  ids: z.array(z.string().min(1).max(64)).max(200).optional(),
});
export type MarkReadInput = z.infer<typeof markReadInputSchema>;

// ── Kinds and preferences ─────────────────────────────────────────────────────────────────────────────

/** `HH:MM`, 24 h, Europe/Brussels. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** A kind's time option meaning "when the linked task is due" (bins: the task's 20:00 or 07:00). */
export const AT_TASK_TIME = "task";

export const NOTIFICATION_GROUPS = ["household", "tasks", "money", "security", "devices", "accounts"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

/** A kind as Settings shows it; kinds are registered by the features that send them. */
export type NotificationKindInfo = {
  /** `<feature>.<what>`, e.g. `waste.bins`. */
  id: string;
  group: NotificationGroup;
  /** i18n keys `namespace:key` from the owning feature's locales. */
  titleKey: string;
  descriptionKey: string;
  /** Bypasses quiet hours (the alarm). */
  urgent: boolean;
  /** Times the person can choose (`HH:MM`, or `task`); null: sent when it happens. */
  times: string[] | null;
  defaultTime: string | null;
  /** Only for what the person picked (devices): `scope` lists them. */
  scoped: boolean;
  /** On before the person changes anything (for this person's role). */
  defaultEnabled: boolean;
};

export const kindPreferenceSchema = z.object({
  enabled: z.boolean(),
  time: z.union([timeOfDaySchema, z.literal(AT_TASK_TIME)]).optional(),
  /** Scoped kinds: `device:<id>`, `profile:<id>`. */
  scope: z.array(z.string().min(1).max(80)).max(200).optional(),
});
export type KindPreference = z.infer<typeof kindPreferenceSchema>;

export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, start: "22:00", end: "07:00" };

export const notificationPreferencesSchema = z.object({
  quietHours: quietHoursSchema,
  /** Only kinds the person changed; the others use their defaults. */
  kinds: z.record(z.string().min(1).max(80), kindPreferenceSchema),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** `PUT /api/notifications/preferences`: quiet hours and/or some kinds (merged into what is stored). */
export const preferencesInputSchema = z.object({
  quietHours: quietHoursSchema.optional(),
  kinds: z.record(z.string().min(1).max(80), kindPreferenceSchema).optional(),
});
export type PreferencesInput = z.infer<typeof preferencesInputSchema>;

/** `POST /api/notifications/scope`: add or remove one thing (a device…) to a scoped kind. */
export const scopeInputSchema = z.object({
  kind: z.string().min(1).max(80),
  scopeId: z.string().min(1).max(80),
  on: z.boolean(),
});
export type ScopeInput = z.infer<typeof scopeInputSchema>;

/** A kind's effective setting for one person: the stored one, else the kind's defaults. */
export function resolveKindPreference(kind: Pick<NotificationKindInfo, "defaultEnabled" | "defaultTime" | "times">, stored: KindPreference | undefined): Required<Pick<KindPreference, "enabled">> & { time: string | null; scope: string[] } {
  const time = stored?.time && kind.times?.includes(stored.time) ? stored.time : kind.defaultTime;
  return { enabled: stored?.enabled ?? kind.defaultEnabled, time: time ?? null, scope: stored?.scope ?? [] };
}

/** `HH:MM` → minutes after midnight. */
export const minutesOfDay = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Is a wall-clock time (minutes after midnight) inside the quiet hours? The range may cross midnight. */
export function isQuietTime(quiet: QuietHours, minutes: number): boolean {
  if (!quiet.enabled) return false;
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

// ── Devices (Web Push) ────────────────────────────────────────────────────────────────────────────────

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    /** base64url, 65 bytes uncompressed P-256. */
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}={0,2}$/),
    /** base64url, 16 bytes. */
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}={0,2}$/),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export type PushDevice = {
  id: string;
  /** "iPhone · Safari" */
  label: string;
  /** To recognise "this device" in the browser. */
  endpoint: string;
  createdAt: string;
  lastSuccessAt: string | null;
  failureCount: number;
};

export type NotificationSettings = {
  preferences: NotificationPreferences;
  kinds: NotificationKindInfo[];
  devices: PushDevice[];
  /** The server's VAPID public key (base64url) for `pushManager.subscribe`. */
  publicKey: string;
  /**
   * Owners only (else null): where the server's push key lives: `.env`, the database encrypted with
   * INTEGRATIONS_KEY, or the database in plain text (shown as a note).
   */
  keyStorage: "env" | "encrypted" | "plain" | null;
};

/** "iPhone · Safari", "Android · Chrome", "Mac · Firefox" from a user agent; never the full string. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const platform = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /CriOS\/|Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  return [platform, browser].filter(Boolean).join(" · ") || "Browser";
}
