import type { Role } from "@/features/auth/types/auth";
import { NOTIFICATIONS_CHANGED_EVENT, type NotificationPreferences, type NotificationsChangedEvent } from "@/features/notifications/types/notifications";
import type { Locale } from "@/types/common";
import { db, Prisma } from "../lib/db";
import { publish } from "../lib/events";
import { getNotificationKind } from "./notification-kinds";
import { decideDelivery, parsePreferences } from "./notification-policy";
import { pushToUser, type PushOutcome, type PushPayload } from "./push-delivery";
import { pushTopic, type PushOptions } from "./web-push";

/*
 * notify(): the one way features send notifications (docs/NOTIFICATIONS.md).
 *
 *   import { notify } from "../notifications/notify";
 *   await notify({
 *     householdId, kind: "waste.bins", habitantIds: assignees, fallbackToHousehold: true,
 *     content: (locale) => ({ title: …, body: … }),        // in each recipient's language
 *     url: "/tasks/…", tag: `waste:${date}`,
 *   });
 *
 * Per recipient: the kind's role limits and the person's preferences decide (notification-policy.ts); a tag
 * seen for that person within `dedupeMinutes` skips them; the notification is stored (the center, the bell's
 * count over SSE) and pushed to their devices now, or after their quiet hours (urgent kinds never wait).
 * Never throws for one recipient's failing push. The notifications feature imports no other feature: features
 * import this file and register their kinds (notification-kinds.ts).
 */

export type NotifyInput = {
  householdId: string;
  /** A registered kind (`registerNotificationKind`). */
  kind: string;
  /** Recipients: accounts, and/or the accounts of habitants. Neither: the whole household. */
  userIds?: string[];
  habitantIds?: string[];
  /** When the chosen habitants have no account (a child without login): the whole household instead. */
  fallbackToHousehold?: boolean;
  /** Only these roles (e.g. owners). */
  roles?: Role[];
  /** Never these accounts (the person who did it). */
  excludeUserIds?: string[];
  /** Scoped kinds: the things this is about (`device:<id>`, `profile:<id>`). */
  scopeIds?: string[];
  /** Title and body in the recipient's language. Keep it short: phones show ~2 lines. */
  content: (locale: Locale) => { title: string; body: string };
  /** In-app path opened on tap. */
  url?: string | null;
  /** Collapses repeats on the phone, and de-duplicates (see `dedupeMinutes`). */
  tag?: string;
  /** Skip people who got this tag within the window. Default 12 hours when a tag is set; 0 never skips. */
  dedupeMinutes?: number;
  /** Override the kind's urgency. */
  urgent?: boolean;
  data?: Record<string, unknown>;
  /** How long a push service keeps it for an offline phone. Default 24 h (urgent: 1 h). */
  ttlSeconds?: number;
};

export type NotifyResult = { stored: number; pushedNow: number; held: number; skipped: number };

export type Recipient = { userId: string; role: Role; locale: Locale; preferences: NotificationPreferences };

export type StoredNotification = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  tag: string | null;
  urgent: boolean;
  data: Record<string, unknown> | null;
  pushHeldUntil: Date | null;
};

export type NotifierDeps = {
  now: () => Date;
  recipients: (input: NotifyInput) => Promise<Recipient[]>;
  /** Did this person get a notification with this tag since `since`? */
  hasRecentTag: (userId: string, tag: string, since: Date) => Promise<boolean>;
  create: (row: StoredNotification) => Promise<{ id: string }>;
  unreadCount: (userId: string) => Promise<number>;
  push: (userId: string, payload: PushPayload, options: PushOptions) => Promise<PushOutcome>;
  markPushed: (id: string, at: Date) => Promise<void>;
  changed: (householdId: string, userIds: string[]) => void;
};

export const DEFAULT_DEDUPE_MINUTES = 12 * 60;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function pushOptionsFor(notification: Pick<StoredNotification, "urgent" | "tag" | "kind">, ttlSeconds?: number): PushOptions {
  const high = notification.urgent || getNotificationKind(notification.kind)?.priority === "high";
  return {
    urgency: high ? "high" : "normal",
    ttlSeconds: ttlSeconds ?? (notification.urgent ? 3600 : 24 * 3600),
    ...(notification.tag && { topic: pushTopic(notification.tag) }),
  };
}

export function createNotifier(deps: NotifierDeps) {
  return async function notifyWith(input: NotifyInput): Promise<NotifyResult> {
    const result: NotifyResult = { stored: 0, pushedNow: 0, held: 0, skipped: 0 };
    const kind = getNotificationKind(input.kind);
    if (!kind) throw new Error(`Unknown notification kind "${input.kind}"`);
    const now = deps.now();
    const urgent = input.urgent ?? kind.urgent ?? false;
    const dedupeMinutes = input.dedupeMinutes ?? DEFAULT_DEDUPE_MINUTES;
    const changedUsers: string[] = [];

    for (const recipient of await deps.recipients(input)) {
      const decision = decideDelivery({ kind, role: recipient.role, preferences: recipient.preferences, now, scopeIds: input.scopeIds, urgent });
      if (!decision.deliver) {
        result.skipped += 1;
        continue;
      }
      if (input.tag && dedupeMinutes > 0 && (await deps.hasRecentTag(recipient.userId, input.tag, new Date(now.getTime() - dedupeMinutes * 60_000)))) {
        result.skipped += 1;
        continue;
      }
      const content = input.content(recipient.locale);
      const row: StoredNotification = {
        userId: recipient.userId,
        kind: kind.id,
        title: clip(content.title.trim(), 120),
        body: clip(content.body.trim(), 400),
        url: input.url ?? null,
        tag: input.tag ?? null,
        urgent,
        data: input.data ?? null,
        pushHeldUntil: decision.push === "held" ? decision.until : null,
      };
      const { id } = await deps.create(row);
      result.stored += 1;
      changedUsers.push(recipient.userId);
      if (decision.push === "held") {
        result.held += 1;
        continue;
      }
      try {
        const unread = await deps.unreadCount(recipient.userId);
        const outcome = await deps.push(recipient.userId, { id, kind: row.kind, title: row.title, body: row.body, url: row.url, tag: row.tag, urgent, unread }, pushOptionsFor(row, input.ttlSeconds));
        if (outcome.sent > 0) {
          result.pushedNow += 1;
          await deps.markPushed(id, deps.now());
        }
      } catch (error) {
        console.error(`[notifications] push for ${kind.id} failed`, error);
      }
    }
    if (changedUsers.length > 0) deps.changed(input.householdId, changedUsers);
    return result;
  };
}

// ── The app's notifier (Prisma, Web Push, SSE) ────────────────────────────────────────────────────────

const ROLE_ROW: Record<Role, "OWNER" | "ADULT" | "CHILD"> = { owner: "OWNER", adult: "ADULT", child: "CHILD" };

export async function loadRecipients(input: Pick<NotifyInput, "householdId" | "userIds" | "habitantIds" | "fallbackToHousehold" | "roles" | "excludeUserIds">): Promise<Recipient[]> {
  const users = await db.user.findMany({
    where: {
      householdId: input.householdId,
      disabledAt: null,
      ...(input.roles && { role: { in: input.roles.map((role) => ROLE_ROW[role]) } }),
    },
    select: { id: true, role: true, locale: true, habitantId: true, notificationPreference: true },
  });
  const picking = input.userIds !== undefined || input.habitantIds !== undefined;
  let chosen = picking
    ? users.filter((user) => input.userIds?.includes(user.id) || (user.habitantId !== null && input.habitantIds?.includes(user.habitantId)))
    : users;
  if (picking && chosen.length === 0 && input.fallbackToHousehold) chosen = users;
  return chosen
    .filter((user) => !input.excludeUserIds?.includes(user.id))
    .map((user) => ({
      userId: user.id,
      role: user.role.toLowerCase() as Role,
      locale: user.locale === "nl" ? "nl" : "en",
      preferences: parsePreferences(user.notificationPreference),
    }));
}

export const countUnread = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export const publishNotificationsChanged = (householdId: string, userIds: string[]) =>
  publish<NotificationsChangedEvent>(householdId, NOTIFICATIONS_CHANGED_EVENT, { userIds: [...new Set(userIds)] });

export const notify = createNotifier({
  now: () => new Date(),
  recipients: loadRecipients,
  hasRecentTag: async (userId, tag, since) => (await db.notification.count({ where: { userId, tag, createdAt: { gte: since } } })) > 0,
  create: (row) =>
    db.notification.create({
      data: { ...row, data: row.data === null ? Prisma.DbNull : (row.data as Prisma.InputJsonValue) },
      select: { id: true },
    }),
  unreadCount: countUnread,
  push: pushToUser,
  markPushed: async (id, at) => {
    await db.notification.update({ where: { id }, data: { pushedAt: at } });
  },
  changed: publishNotificationsChanged,
});

/** For callers that must not wait or fail (request handlers): logs instead of throwing. */
export function notifyInBackground(input: NotifyInput): void {
  void notify(input).catch((error: unknown) => console.error(`[notifications] ${input.kind} failed`, error));
}
