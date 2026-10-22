import { z } from "zod";
import { kindAllowsRole, kindInfoFor, listNotificationKinds } from "@/api/notifications/notification-kinds";
import { getSettings, listNotifications, markRead, savePreferences } from "@/api/notifications/notifications.service";
import { AT_TASK_TIME, resolveKindPreference, type NotificationKindInfo, type NotificationSettings } from "@/features/notifications/types/notifications";
import type { Locale } from "@/types/common";
import { formatDateTime } from "@/types/date-format";
import { appText, capList, done, entityRef, registerAssistantTool, registerEntityResolver, say, timeSchema, type AssistantToolContext } from "@ai/core/kit";

/**
 * Notifications, part of the "settings" skill: the person's own notification center (the bell) and their
 * preferences (Settings › Notifications: quiet hours, per kind on/off and time). Everyone, children too, and
 * only ever the person's own notifications. Push devices are turned on in the browser (Settings), so they are
 * only counted here; the server's push keys and device endpoints are never returned.
 */

const EVERYONE = ["owner", "adult", "child"] as const;

/** The kinds this person can change, as Settings shows them. */
const kindsFor = (ctx: AssistantToolContext): NotificationKindInfo[] =>
  listNotificationKinds()
    .filter((kind) => !kind.hidden && kindAllowsRole(kind, ctx.user.role))
    .map((kind) => kindInfoFor(kind, ctx.user.role));

const kindTitle = (kind: Pick<NotificationKindInfo, "id" | "titleKey">, locale: AssistantToolContext["locale"]) => appText(kind.titleKey, locale) ?? kind.id;

registerEntityResolver({
  type: "notification_kind",
  label: "kind of notification",
  // No skill: kind titles ("Vuilnisbakken") must not pull questions about the bins into the settings skill.
  searchable: false,
  list: async (ctx) =>
    kindsFor(ctx).map((kind) => ({
      id: kind.id,
      name: kindTitle(kind, ctx.locale),
      aliases: [kind.id, kindTitle(kind, ctx.locale === "nl" ? "en" : "nl")],
      hint: kind.group,
    })),
});

const short = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

registerAssistantTool({
  name: "settings.notifications",
  description: "The person's notifications (the bell): unread ones by default, newest first, with title and text.",
  input: z.object({
    all: z.boolean().default(false).describe("Also read ones (the most recent)"),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  permission: "read",
  confirm: "never",
  roles: EVERYONE,
  activity: { en: "Checked the notifications", nl: "Meldingen bekeken" },
  run: async (ctx, input) => {
    const page = await listNotifications(ctx.user, { limit: 50 });
    const items = page.items.filter((item) => input.all || !item.readAt);
    return {
      unread: page.unread,
      ...capList(items, input.limit, (item) => ({
        id: item.id,
        at: formatDateTime(item.createdAt, ctx.locale),
        title: item.title,
        text: short(item.body),
        urgent: item.urgent || null,
        read: item.readAt ? true : null,
      })),
    };
  },
});

registerAssistantTool({
  name: "settings.mark_read",
  description: "Mark the person's notifications as read: the given ids (from settings_notifications), or all of them.",
  input: z.object({
    ids: z.array(z.string().min(1).max(64)).max(50).optional().describe("Notification ids; leave out for all"),
  }),
  permission: "write",
  confirm: "first-time",
  roles: EVERYONE,
  activity: { en: "Marked notifications as read", nl: "Meldingen gelezen gezet" },
  describe: (ctx, input) =>
    input.ids?.length
      ? say(ctx.locale, `Mark ${input.ids.length} notification(s) as read`, `${input.ids.length} melding(en) als gelezen markeren`)
      : say(ctx.locale, "Mark all notifications as read", "Alle meldingen als gelezen markeren"),
  run: async (ctx, input) => {
    const { unread } = await markRead(ctx.user, { ids: input.ids?.length ? input.ids : undefined });
    return done(`Marked as read; ${unread} unread left.`);
  },
});

registerAssistantTool({
  name: "settings.notification_prefs",
  description: "The person's notification settings: quiet hours, each kind of notification on or off (and its time), and how many devices get push.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  roles: EVERYONE,
  activity: { en: "Checked the notification settings", nl: "Meldingsinstellingen bekeken" },
  run: async (ctx) => prefsSummary(await getSettings(ctx.user), ctx.locale),
});

/** Settings › Notifications for the model: quiet hours, kinds, device labels; never the push key or endpoints. */
export function prefsSummary(settings: NotificationSettings, locale: Locale) {
  const quiet = settings.preferences.quietHours;
  return {
    quietHours: quiet.enabled ? `${quiet.start}–${quiet.end}` : "off",
    kinds: settings.kinds.map((kind) => {
      const pref = resolveKindPreference(kind, settings.preferences.kinds[kind.id]);
      return {
        kind: kindTitle(kind, locale),
        on: pref.enabled,
        time: pref.time === AT_TASK_TIME ? "at the task's time" : pref.time,
        times: kind.times && kind.times.length > 1 ? kind.times.join(", ") : null,
        urgent: kind.urgent || null,
      };
    }),
    pushDevices: settings.devices.map((device) => device.label),
  };
}

registerAssistantTool({
  name: "settings.set_notification_prefs",
  description: "Change the person's notification settings: quiet hours on/off and from–until, and/or one kind on or off and its time.",
  input: z.object({
    quietHours: z.boolean().optional().describe("Quiet hours on (true) or off (false)"),
    quietFrom: timeSchema("Start of quiet hours HH:MM").optional(),
    quietUntil: timeSchema("End of quiet hours HH:MM").optional(),
    kind: entityRef("notification_kind", "Kind of notification by name, e.g. 'vuilnisbakken', 'te betalen'").optional(),
    on: z.boolean().optional().describe("The kind on (true) or off (false)"),
    time: z.string().trim().max(8).optional().describe("The kind's time HH:MM (only the times it offers)"),
  }),
  permission: "write",
  confirm: "first-time",
  roles: EVERYONE,
  activity: { en: "Changed notification settings", nl: "Meldingsinstellingen gewijzigd" },
  describe: (ctx, input) => {
    const parts: string[] = [];
    if (input.quietHours !== undefined || input.quietFrom || input.quietUntil) {
      parts.push(
        input.quietHours === false
          ? say(ctx.locale, "quiet hours off", "stille uren uit")
          : say(ctx.locale, `quiet hours ${input.quietFrom ?? "…"}–${input.quietUntil ?? "…"}`, `stille uren ${input.quietFrom ?? "…"}–${input.quietUntil ?? "…"}`),
      );
    }
    if (input.kind) {
      const state = input.on === false ? say(ctx.locale, "off", "uit") : input.on ? say(ctx.locale, "on", "aan") : "";
      parts.push(`${input.kind.name} ${state}${input.time ? ` ${input.time}` : ""}`.trim());
    }
    return say(ctx.locale, `Notifications: ${parts.join(", ")}`, `Meldingen: ${parts.join(", ")}`);
  },
  run: async (ctx, input) => {
    const settings = await getSettings(ctx.user);
    const changes: Parameters<typeof savePreferences>[1] = {};
    if (input.quietHours !== undefined || input.quietFrom || input.quietUntil) {
      const current = settings.preferences.quietHours;
      changes.quietHours = { enabled: input.quietHours ?? true, start: input.quietFrom ?? current.start, end: input.quietUntil ?? current.end };
    }
    if (input.kind) {
      const kind = settings.kinds.find((row) => row.id === input.kind?.id);
      if (!kind) return { error: `Unknown kind of notification "${input.kind.name}".` };
      const current = resolveKindPreference(kind, settings.preferences.kinds[kind.id]);
      if (input.time && !kind.times?.includes(input.time)) return { error: `${input.kind.name} offers these times: ${kind.times?.join(", ") || "none (sent when it happens)"}.` };
      const time = input.time ?? current.time;
      changes.kinds = {
        [kind.id]: {
          enabled: input.on ?? (input.time ? true : current.enabled),
          ...(time ? { time } : {}),
          ...(current.scope.length ? { scope: current.scope } : {}),
        },
      };
    }
    if (!changes.quietHours && !changes.kinds) return { error: "Say what to change: quiet hours, or a kind of notification on/off or its time." };
    const saved = await savePreferences(ctx.user, changes);
    const quiet = saved.quietHours;
    return done(`Saved. Quiet hours: ${quiet.enabled ? `${quiet.start}–${quiet.end}` : "off"}${input.kind ? `; ${input.kind.name}: ${saved.kinds[input.kind.id]?.enabled ? "on" : "off"}` : ""}.`);
  },
});
