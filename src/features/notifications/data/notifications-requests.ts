import { api } from "@/lib/api-client";
import type {
  MarkReadInput,
  NotificationPreferences,
  NotificationSettings,
  NotificationsPage,
  NotificationsQuery,
  PreferencesInput,
  PushDevice,
  PushSubscriptionInput,
  ScopeInput,
} from "../types/notifications";

export function fetchNotifications(query: NotificationsQuery = {}): Promise<NotificationsPage> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const search = params.toString();
  return api.get<NotificationsPage>(`/notifications${search ? `?${search}` : ""}`);
}

export const fetchUnreadCount = () => api.get<{ unread: number }>("/notifications/unread-count");
export const markNotificationsRead = (input: MarkReadInput = {}) => api.post<{ unread: number }>("/notifications/read", input);
export const fetchNotificationSettings = () => api.get<NotificationSettings>("/notifications/settings");
export const saveNotificationPreferences = (input: PreferencesInput) => api.put<NotificationPreferences>("/notifications/preferences", input);
export const setNotificationScope = (input: ScopeInput) => api.post<{ on: boolean; scope: string[] }>("/notifications/scope", input);
export const registerPushDevice = (input: PushSubscriptionInput) => api.post<PushDevice>("/notifications/devices", input);
export const removePushDevice = (id: string) => api.delete(`/notifications/devices/${encodeURIComponent(id)}`);
export const sendTestNotification = () => api.post<{ devices: number; pushed: boolean }>("/notifications/test");

/** What the notification screens and sections need from the API; stories pass a fake. */
export type NotificationsClient = {
  list: (query: NotificationsQuery) => Promise<NotificationsPage>;
  markRead: (input: MarkReadInput) => Promise<{ unread: number }>;
  settings: () => Promise<NotificationSettings>;
  savePreferences: (input: PreferencesInput) => Promise<NotificationPreferences>;
  setScope: (input: ScopeInput) => Promise<{ on: boolean; scope: string[] }>;
  registerDevice: (input: PushSubscriptionInput) => Promise<PushDevice>;
  removeDevice: (id: string) => Promise<void>;
  test: () => Promise<{ devices: number; pushed: boolean }>;
};

export const notificationsClient: NotificationsClient = {
  list: fetchNotifications,
  markRead: markNotificationsRead,
  settings: fetchNotificationSettings,
  savePreferences: saveNotificationPreferences,
  setScope: setNotificationScope,
  registerDevice: registerPushDevice,
  removeDevice: removePushDevice,
  test: sendTestNotification,
};
