import type { NotificationItem, NotificationKindInfo, NotificationSettings, NotificationsClient, PushBrowser, PushDevice, PushSupport } from "@/features/notifications";

/** A fixed clock so relative times ("5 minutes ago") stay the same in every story. */
export const NOW = Date.parse("2026-10-06T18:05:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const item = (id: string, minutes: number, fields: Partial<NotificationItem>): NotificationItem => ({
  id,
  kind: "tasks.assigned",
  title: "",
  body: "",
  url: null,
  urgent: false,
  createdAt: ago(minutes),
  readAt: null,
  ...fields,
});

export const notificationsFixture: NotificationItem[] = [
  item("n1", 5, { kind: "waste.bins", title: "Put out tonight: Papier & karton + Pmd", body: "Collection tomorrow, Wed 7 Oct.", url: "/tasks/t1" }),
  item("n2", 40, { kind: "alarm.triggered", title: "Alarm! The alarm went off", body: "Verisure · 17:25", urgent: true, url: "/house" }),
  item("n3", 300, { kind: "tasks.payments", title: "Pay tomorrow: Watergroep · € 52,30", body: "Due on Wed 7 Oct.", url: "/expenses/e1" }),
  item("n4", 600, { kind: "tasks.digest", title: "Today: 3 tasks (1 overdue)", body: "Overdue: Pay Fluvius · Today: Mow the lawn and Water the plants", url: "/tasks", readAt: ago(590) }),
  item("n5", 1500, { kind: "tasks.assigned", title: "Assigned to you: Clean the gutters", body: "By Clara · due Sat 10 Oct", url: "/tasks/t2", readAt: ago(1400) }),
  item("n6", 3000, { kind: "devices.indicator", title: "Window bedroom: Open", body: "Turned orange · Bedroom", url: "/devices/d1", readAt: ago(2900) }),
  item("n7", 4500, { kind: "alarm.armed", title: "Alarm armed (away)", body: "By Rob · 08:12 · Verisure", url: "/house", readAt: ago(4400) }),
  item("n8", 9000, { kind: "income.vouchers", title: "Meal vouchers expire soon: € 23,40", body: "Use them before Sat 10 Oct.", url: "/income", readAt: ago(8000) }),
  item("n9", 12000, { kind: "integrations.mail-bills", title: "2 bills found in your mail", body: "Fluvius € 89,90 and Telenet € 45,00. Review them under Expenses → Upcoming.", url: "/expenses", readAt: ago(11000) }),
  item("n10", 15000, { kind: "auth.invite-accepted", title: "Clara joined WickedHome", body: "Signed up with the invite link, as adult.", url: "/settings#accounts", readAt: ago(14000) }),
];

const kind = (id: string, group: NotificationKindInfo["group"], namespace: string, key: string, extra: Partial<NotificationKindInfo> = {}): NotificationKindInfo => ({
  id,
  group,
  titleKey: `${namespace}:notifications.${key}.title`,
  descriptionKey: `${namespace}:notifications.${key}.description`,
  urgent: false,
  times: null,
  defaultTime: null,
  scoped: false,
  defaultEnabled: true,
  ...extra,
});

export const kindsFixture: NotificationKindInfo[] = [
  kind("waste.bins", "household", "waste", "bins", { times: ["task", "18:00", "19:00", "20:00", "21:00"], defaultTime: "task" }),
  kind("tasks.digest", "tasks", "tasks", "digest", { times: ["07:00", "07:30", "08:00", "08:30", "09:00"], defaultTime: "08:00" }),
  kind("tasks.assigned", "tasks", "tasks", "assigned"),
  kind("tasks.unblocked", "tasks", "tasks", "unblocked"),
  kind("tasks.payments", "money", "tasks", "payments", { times: ["08:00", "09:00", "12:00", "18:00", "20:00"], defaultTime: "09:00" }),
  kind("expenses.auto-paid", "money", "expenses", "autoPaid", { defaultEnabled: false }),
  kind("income.vouchers", "money", "income", "vouchers", { times: ["08:00", "09:00", "12:00", "18:00"], defaultTime: "09:00" }),
  kind("alarm.triggered", "security", "home-assistant", "triggered", { urgent: true }),
  kind("alarm.armed", "security", "home-assistant", "armed"),
  kind("home-assistant.connection", "security", "home-assistant", "connection"),
  kind("devices.indicator", "devices", "devices", "indicator", { scoped: true }),
  kind("integrations.mail-bills", "accounts", "integrations", "mailBills"),
  kind("auth.invite-accepted", "accounts", "auth", "inviteAccepted"),
];

export const THIS_DEVICE = "https://fcm.googleapis.com/fcm/send/this-phone";

export const devicesFixture: PushDevice[] = [
  { id: "p1", label: "Android · Chrome", endpoint: THIS_DEVICE, createdAt: ago(20000), lastSuccessAt: ago(5), failureCount: 0 },
  { id: "p2", label: "iPhone", endpoint: "https://web.push.apple.com/QAbc", createdAt: ago(40000), lastSuccessAt: ago(300), failureCount: 0 },
  { id: "p3", label: "Windows · Edge", endpoint: "https://wns2.notify.windows.com/w/?token=x", createdAt: ago(90000), lastSuccessAt: null, failureCount: 3 },
];

export const settingsFixture: NotificationSettings = {
  preferences: {
    quietHours: { enabled: true, start: "22:00", end: "07:00" },
    kinds: { "tasks.digest": { enabled: true, time: "07:30" }, "devices.indicator": { enabled: true, scope: ["device:d1", "device:d2"] }, "tasks.unblocked": { enabled: false } },
  },
  kinds: kindsFixture,
  devices: devicesFixture,
  publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  keyStorage: null,
};

const wait = (ms: number) => new Promise<void>((resolve) => (Number.isFinite(ms) ? setTimeout(resolve, ms) : undefined));

type FakeOptions = { delayMs?: number; fail?: boolean; pageSize?: number };

/** A client that answers from memory (and remembers marks and saves while the story is open). */
export function fakeNotificationsClient(items: NotificationItem[] = notificationsFixture, settings: NotificationSettings = settingsFixture, { delayMs = 300, fail = false, pageSize = 50 }: FakeOptions = {}): NotificationsClient {
  let current = items.map((entry) => ({ ...entry }));
  let stored = structuredClone(settings);
  const answer = async <T,>(value: () => T): Promise<T> => {
    await wait(delayMs);
    if (fail) throw new Error("Fake failure");
    return value();
  };
  return {
    list: (query) =>
      answer(() => {
        const start = query.cursor ? Number(query.cursor) : 0;
        const page = current.slice(start, start + pageSize);
        return { items: page, unread: current.filter((entry) => entry.readAt === null).length, nextCursor: start + pageSize < current.length ? String(start + pageSize) : null };
      }),
    markRead: (input) =>
      answer(() => {
        current = current.map((entry) => (entry.readAt === null && (!input.ids || input.ids.includes(entry.id)) ? { ...entry, readAt: new Date(NOW).toISOString() } : entry));
        return { unread: current.filter((entry) => entry.readAt === null).length };
      }),
    settings: () => answer(() => structuredClone(stored)),
    savePreferences: (input) =>
      answer(() => {
        stored = { ...stored, preferences: { quietHours: input.quietHours ?? stored.preferences.quietHours, kinds: { ...stored.preferences.kinds, ...input.kinds } } };
        return stored.preferences;
      }),
    setScope: (input) =>
      answer(() => {
        const existing = stored.preferences.kinds[input.kind]?.scope ?? [];
        const scope = input.on ? [...new Set([...existing, input.scopeId])] : existing.filter((id) => id !== input.scopeId);
        stored.preferences.kinds[input.kind] = { enabled: true, scope };
        return { on: input.on, scope };
      }),
    registerDevice: (input) =>
      answer(() => {
        const device: PushDevice = { id: `p${stored.devices.length + 1}`, label: "Android · Chrome", endpoint: input.endpoint, createdAt: new Date(NOW).toISOString(), lastSuccessAt: null, failureCount: 0 };
        stored = { ...stored, devices: [...stored.devices, device] };
        return device;
      }),
    removeDevice: (id) =>
      answer(() => {
        stored = { ...stored, devices: stored.devices.filter((device) => device.id !== id) };
      }),
    test: () => answer(() => ({ devices: stored.devices.length, pushed: stored.devices.length > 0 })),
  };
}

/** The browser side: which case this device is, and whether it already has a subscription. */
export function fakePushBrowser(support: PushSupport = "available", currentEndpoint: string | null = THIS_DEVICE): PushBrowser {
  return {
    support: () => support,
    currentEndpoint: async () => currentEndpoint,
    subscribe: async () => {
      await wait(600);
      return { endpoint: THIS_DEVICE, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } };
    },
    unsubscribe: async () => undefined,
  };
}
