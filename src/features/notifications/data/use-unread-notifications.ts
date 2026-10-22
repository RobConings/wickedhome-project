import * as React from "react";
import { useLiveEvents } from "@/lib/live-events";
import { LIVE_READY_EVENT } from "@/types/live-events";
import { NOTIFICATIONS_CHANGED_EVENT, type NotificationsChangedEvent } from "../types/notifications";
import { fetchUnreadCount } from "./notifications-requests";

/*
 * The signed-in person's unread count, shared by the bell and the menu item: loaded once, reloaded when the
 * household stream says their notifications changed (`notification.changed`) or reconnects (`ready`). Also
 * sets the app icon badge where the platform supports it (installed app on Android, iOS 16.4+, desktop).
 */

let count: number | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(value: number) {
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener();
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }) : null;
  if (value > 0) void nav?.setAppBadge?.(value).catch(() => undefined);
  else void nav?.clearAppBadge?.().catch(() => undefined);
}

function refresh() {
  inflight ??= fetchUnreadCount()
    .then(({ unread }) => set(unread))
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
}

/** After marking read in the center: show the new count at once. */
export const setUnreadNotificationCount = (value: number) => set(value);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** `null` until loaded. `enabled: false` in Storybook. */
export function useUnreadNotifications(userId: string, { enabled = true }: { enabled?: boolean } = {}): number | null {
  const value = React.useSyncExternalStore(subscribe, () => count, () => null);
  React.useEffect(() => {
    if (enabled) refresh();
  }, [enabled, userId]);
  useLiveEvents<NotificationsChangedEvent>(
    NOTIFICATIONS_CHANGED_EVENT,
    (data) => {
      if (data.userIds.includes(userId)) refresh();
    },
    { enabled },
  );
  useLiveEvents(LIVE_READY_EVENT, () => refresh(), { enabled });
  return value;
}
