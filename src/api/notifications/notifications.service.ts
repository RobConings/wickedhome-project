import type { SessionUser } from "@/features/auth/types/auth";
import {
  deviceLabel,
  notificationsQuerySchema,
  type MarkReadInput,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationSettings,
  type NotificationsPage,
  type NotificationsQuery,
  type PreferencesInput,
  type PushDevice,
  type PushSubscriptionInput,
  type ScopeInput,
} from "@/features/notifications/types/notifications";
import { db, type Prisma } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { getNotificationKind, kindAllowsRole, kindInfoFor, listNotificationKinds, registerNotificationKind } from "./notification-kinds";
import { parsePreferences } from "./notification-policy";
import { countUnread, notify, publishNotificationsChanged } from "./notify";
import { isAllowedPushEndpoint } from "./push-delivery";
import { getVapid } from "./vapid-keys";

/** The "Send a test notification" button: always on, never waits for quiet hours, not listed in Settings. */
registerNotificationKind({
  id: "notifications.test",
  group: "accounts",
  titleKey: "notifications:kinds.test.title",
  descriptionKey: "notifications:kinds.test.description",
  urgent: true,
  hidden: true,
});

type NotificationRow = Prisma.NotificationGetPayload<object>;

const toItem = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  url: row.url,
  urgent: row.urgent,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
});

const encodeCursor = (row: Pick<NotificationRow, "createdAt" | "id">) => `${row.createdAt.toISOString()}_${row.id}`;
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [at, id] = cursor.split("_");
  const createdAt = at ? new Date(at) : null;
  return createdAt && !Number.isNaN(createdAt.getTime()) && id ? { createdAt, id } : null;
}

// ── The center ───────────────────────────────────────────────────────────────────────────────────────

export async function listNotifications(user: SessionUser, query: NotificationsQuery): Promise<NotificationsPage> {
  const { cursor, limit } = notificationsQuerySchema.parse(query);
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await db.notification.findMany({
    where: {
      userId: user.id,
      ...(after && { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { items: page.map(toItem), unread: await countUnread(user.id), nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

export const unreadCount = async (user: SessionUser) => ({ unread: await countUnread(user.id) });

export async function markRead(user: SessionUser, input: MarkReadInput): Promise<{ unread: number }> {
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(input.ids && { id: { in: input.ids } }) },
    data: { readAt: new Date() },
  });
  publishNotificationsChanged(user.householdId, [user.id]);
  return unreadCount(user);
}

// ── Settings ─────────────────────────────────────────────────────────────────────────────────────────

const toDevice = (row: Prisma.PushSubscriptionGetPayload<object>): PushDevice => ({
  id: row.id,
  label: row.label ?? deviceLabel(row.userAgent),
  endpoint: row.endpoint,
  createdAt: row.createdAt.toISOString(),
  lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  failureCount: row.failureCount,
});

async function loadPreferences(userId: string): Promise<NotificationPreferences> {
  return parsePreferences(await db.notificationPreference.findUnique({ where: { userId } }));
}

export async function getSettings(user: SessionUser): Promise<NotificationSettings> {
  const [preferences, devices, vapid] = await Promise.all([
    loadPreferences(user.id),
    db.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    getVapid(),
  ]);
  const kinds = listNotificationKinds()
    .filter((kind) => !kind.hidden && kindAllowsRole(kind, user.role))
    .map((kind) => kindInfoFor(kind, user.role));
  return {
    preferences,
    kinds,
    devices: devices.map(toDevice),
    publicKey: vapid.keys.publicKey,
    // Owners see where the server's push key lives (a plain key in the database deserves a note).
    keyStorage: user.role === "owner" ? vapid.storage : null,
  };
}

async function storePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
  const data = {
    quietHoursEnabled: preferences.quietHours.enabled,
    quietStart: preferences.quietHours.start,
    quietEnd: preferences.quietHours.end,
    kinds: preferences.kinds as Prisma.InputJsonValue,
  };
  await db.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

function assertKnownKind(user: SessionUser, id: string) {
  const kind = getNotificationKind(id);
  if (!kind || kind.hidden || !kindAllowsRole(kind, user.role)) throw badRequest("Validation failed", { kinds: [`Unknown kind ${id}`] });
  return kind;
}

export async function savePreferences(user: SessionUser, input: PreferencesInput): Promise<NotificationPreferences> {
  const current = await loadPreferences(user.id);
  for (const id of Object.keys(input.kinds ?? {})) assertKnownKind(user, id);
  const next: NotificationPreferences = {
    quietHours: input.quietHours ?? current.quietHours,
    kinds: { ...current.kinds, ...input.kinds },
  };
  await storePreferences(user.id, next);
  return next;
}

/** Adds or removes one thing (a device, a profile) from a scoped kind; turns the kind on when adding. */
export async function setScope(user: SessionUser, input: ScopeInput): Promise<{ on: boolean; scope: string[] }> {
  const kind = assertKnownKind(user, input.kind);
  if (!kind.scoped) throw badRequest("Validation failed", { kind: ["Not a scoped kind"] });
  const current = await loadPreferences(user.id);
  const existing = current.kinds[kind.id];
  const scope = new Set(existing?.scope ?? []);
  if (input.on) scope.add(input.scopeId);
  else scope.delete(input.scopeId);
  const next = { ...existing, enabled: input.on ? true : (existing?.enabled ?? kindInfoFor(kind, user.role).defaultEnabled), scope: [...scope] };
  await storePreferences(user.id, { ...current, kinds: { ...current.kinds, [kind.id]: next } });
  return { on: input.on, scope: next.scope };
}

// ── Devices ──────────────────────────────────────────────────────────────────────────────────────────

/** Saves this browser's push subscription for the signed-in person (re-subscribing moves an endpoint to them). */
export async function subscribe(user: SessionUser, input: PushSubscriptionInput, userAgent: string | undefined): Promise<PushDevice> {
  if (!isAllowedPushEndpoint(input.endpoint)) throw badRequest("Validation failed", { endpoint: ["Unknown push service"] });
  const data = {
    userId: user.id,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
    label: deviceLabel(userAgent),
    failureCount: 0,
    lastError: null,
  };
  const row = await db.pushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { endpoint: input.endpoint, ...data }, update: data });
  return toDevice(row);
}

export async function removeDevice(user: SessionUser, id: string): Promise<void> {
  const { count } = await db.pushSubscription.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw notFound("Device not found");
}

export async function sendTest(user: SessionUser): Promise<{ devices: number; pushed: boolean }> {
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  const result = await notify({
    householdId: user.householdId,
    kind: "notifications.test",
    userIds: [user.id],
    dedupeMinutes: 0,
    tag: "notifications:test",
    url: "/notifications",
    content: (locale) =>
      locale === "nl"
        ? { title: "Testmelding", body: "Meldingen werken op dit toestel." }
        : { title: "Test notification", body: "Notifications work on this device." },
  });
  return { devices, pushed: result.pushedNow > 0 };
}
