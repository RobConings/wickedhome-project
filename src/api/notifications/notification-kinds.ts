import type { Role } from "@/features/auth/types/auth";
import type { NotificationGroup, NotificationKindInfo } from "@/features/notifications/types/notifications";

/**
 * The kinds of notifications, registered by the features that send them (like jobs), so Settings can list
 * them and the notifications feature never has to know the others:
 *
 *   // src/api/waste/waste.notifications.ts
 *   registerNotificationKind({
 *     id: "waste.bins", group: "household",
 *     titleKey: "waste:notifications.bins.title", descriptionKey: "waste:notifications.bins.description",
 *     times: ["task", "18:00", "19:00", "20:00", "21:00"], defaultTime: "task",
 *   });
 */

export type NotificationKindDefinition = {
  /** `<feature>.<what>`, lowercase. */
  id: string;
  group: NotificationGroup;
  titleKey: string;
  descriptionKey: string;
  /** Bypasses quiet hours and is pushed with high urgency. Default false. */
  urgent?: boolean;
  /**
   * Push priority outside quiet hours. "high" wakes a sleeping phone at once (Android holds back "normal"
   * pushes until it wakes up by itself, which can take hours); use it for things a person has to act on
   * (a task for you, bins tonight, a payment due). Quiet hours still apply. Default "normal"; urgent kinds are
   * always "high".
   */
  priority?: "high" | "normal";
  /**
   * Pushed right away also during quiet hours, without being "urgent" (no alarm styling): for a moment the
   * person chose themselves, like a task reminder at 21:00. Can still be switched off in Settings. Default false.
   */
  bypassQuietHours?: boolean;
  /** Times the person may choose; first or `defaultTime` is the default. Omit for "when it happens". */
  times?: string[];
  defaultTime?: string;
  /** Only for the things a person picked (`scope`). Default false. */
  scoped?: boolean;
  /** Default on (true), off (false), or on only for some roles. Default true. */
  defaultEnabled?: boolean | Role[];
  /** Who can get it at all (e.g. owners for the Home Assistant connection). Default everyone. */
  roles?: Role[];
  /** Not listed in Settings (the test notification). */
  hidden?: boolean;
};

const KIND_ID = /^[a-z][a-z0-9-]*\.[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const I18N_KEY = /^[a-z][a-z0-9-]*:[A-Za-z0-9_.-]+$/;

const kinds = new Map<string, NotificationKindDefinition>();

/** Registers a kind. Throws on a malformed or duplicate id or i18n key. Re-registering the same id replaces it (dev reloads). */
export function registerNotificationKind(definition: NotificationKindDefinition): NotificationKindDefinition {
  if (!KIND_ID.test(definition.id)) throw new Error(`Notification kind "${definition.id}" must look like "<feature>.<what>"`);
  for (const key of [definition.titleKey, definition.descriptionKey]) {
    if (!I18N_KEY.test(key)) throw new Error(`Notification kind "${definition.id}": "${key}" must be an i18n key "namespace:key"`);
  }
  if (definition.defaultTime && !definition.times?.includes(definition.defaultTime)) {
    throw new Error(`Notification kind "${definition.id}": defaultTime must be one of times`);
  }
  kinds.set(definition.id, definition);
  return definition;
}

export const getNotificationKind = (id: string) => kinds.get(id);

export const listNotificationKinds = () => [...kinds.values()];

/** Whether someone with this role can receive the kind at all. */
export const kindAllowsRole = (kind: NotificationKindDefinition, role: Role) => !kind.roles || kind.roles.includes(role);

/** The kind as one person's Settings show it. */
export function kindInfoFor(kind: NotificationKindDefinition, role: Role): NotificationKindInfo {
  const defaultEnabled = Array.isArray(kind.defaultEnabled) ? kind.defaultEnabled.includes(role) : (kind.defaultEnabled ?? true);
  return {
    id: kind.id,
    group: kind.group,
    titleKey: kind.titleKey,
    descriptionKey: kind.descriptionKey,
    urgent: kind.urgent ?? false,
    times: kind.times ?? null,
    defaultTime: kind.defaultTime ?? kind.times?.[0] ?? null,
    scoped: kind.scoped ?? false,
    defaultEnabled,
  };
}

/** Tests only. */
export const unregisterNotificationKind = (id: string) => kinds.delete(id);
