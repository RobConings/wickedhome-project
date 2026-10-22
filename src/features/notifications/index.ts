// Public API of the notifications feature (docs/NOTIFICATIONS.md): the notification center, the bell in the app
// frame, Settings → Notifications and "Notify me" for other features' pages. The server side is src/api/notifications;
// features send with `notify()` there and never import this browser feature for it.
export { NotificationBell } from "./components/notification-bell";
export { NotificationKindIcon, NotificationRow, NotificationTile } from "./components/notification-row";
export { formatNotificationTime } from "./components/notification-time";
export { NotificationKindList } from "./components/notification-kind-list";
export { NotificationSettingsSection } from "./components/notification-settings-section";
export { NotifyMeToggle } from "./components/notify-me-toggle";
export { PushDeviceList } from "./components/push-device-list";
export { PushEnablePanel } from "./components/push-enable-panel";
export { QuietHoursFields } from "./components/quiet-hours-fields";
export { NotificationsScreen } from "./screens/notifications-screen";
export { notificationsClient, type NotificationsClient } from "./data/notifications-requests";
export { browserPush, pushSupportOf, type PushBrowser, type PushEnvironment, type PushSupport } from "./data/push-support";
export { setUnreadNotificationCount, useUnreadNotifications } from "./data/use-unread-notifications";
export {
  DEFAULT_QUIET_HOURS,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationItem,
  type NotificationKindInfo,
  type NotificationPreferences,
  type NotificationSettings,
  type NotificationsPage,
  type PushDevice,
} from "./types/notifications";
