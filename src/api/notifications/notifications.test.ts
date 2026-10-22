/**
 * Notifications without a database: who gets what (role limits, preferences, scopes), quiet hours and the
 * urgent bypass, de-duplication by tag, subscription cleanup on 404/410, the Web Push request itself (VAPID
 * JWT verified, payload decrypted like a browser would), and the morning task digest.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/notifications/notifications.test.ts
 */
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { after, describe, it } from "node:test";
import { DEFAULT_QUIET_HOURS, isQuietTime, resolveKindPreference, type NotificationPreferences } from "@/features/notifications/types/notifications";
import { alarmChangeOf } from "../home-assistant/ha-notifications";
import { buildTaskDigest, type DigestTask } from "../tasks/task-notifications";
import { binsReminderDue } from "../waste/waste.notifications";
import { voucherReminder } from "../income/income.notifications";
import { kindInfoFor, registerNotificationKind, unregisterNotificationKind } from "./notification-kinds";
import { decideDelivery, isTimeDue, parsePreferences, quietHoursEnd } from "./notification-policy";
import { createNotifier, type NotifierDeps, type Recipient, type StoredNotification } from "./notify";
import { isAllowedPushEndpoint, pushToSubscriptions, type PushStore, type SubscriptionRow } from "./push-delivery";
import { generateVapidKeys, sendPush } from "./web-push";

const KINDS = ["testn.normal", "testn.urgent", "testn.owners", "testn.scoped", "testn.off", "testn.timed"];
registerNotificationKind({ id: "testn.normal", group: "household", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b" });
registerNotificationKind({ id: "testn.urgent", group: "security", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b", urgent: true });
registerNotificationKind({ id: "testn.owners", group: "security", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b", roles: ["owner"] });
registerNotificationKind({ id: "testn.scoped", group: "devices", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b", scoped: true });
registerNotificationKind({ id: "testn.off", group: "money", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b", defaultEnabled: ["owner"] });
registerNotificationKind({ id: "testn.timed", group: "tasks", titleKey: "notifications:t.a", descriptionKey: "notifications:t.b", times: ["07:00", "08:00"], defaultTime: "08:00" });
after(() => KINDS.forEach(unregisterNotificationKind));

const prefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({ quietHours: DEFAULT_QUIET_HOURS, kinds: {}, ...overrides });
/** 12:00 and 23:30 in Brussels (CEST, UTC+2). */
const NOON = new Date("2026-10-03T10:00:00Z");
const LATE = new Date("2026-10-03T21:30:00Z");

describe("quiet hours", () => {
  it("cross midnight", () => {
    assert.equal(isQuietTime(DEFAULT_QUIET_HOURS, 23 * 60), true);
    assert.equal(isQuietTime(DEFAULT_QUIET_HOURS, 6 * 60 + 59), true);
    assert.equal(isQuietTime(DEFAULT_QUIET_HOURS, 7 * 60), false);
    assert.equal(isQuietTime(DEFAULT_QUIET_HOURS, 21 * 60 + 59), false);
    assert.equal(isQuietTime({ ...DEFAULT_QUIET_HOURS, enabled: false }, 23 * 60), false);
    assert.equal(isQuietTime({ enabled: true, start: "13:00", end: "15:00" }, 14 * 60), true);
  });

  it("end at the next 07:00 in Brussels, also after midnight", () => {
    assert.equal(quietHoursEnd(DEFAULT_QUIET_HOURS, LATE)?.toISOString(), "2026-10-04T05:00:00.000Z");
    assert.equal(quietHoursEnd(DEFAULT_QUIET_HOURS, new Date("2026-10-03T02:00:00Z"))?.toISOString(), "2026-10-03T05:00:00.000Z");
    assert.equal(quietHoursEnd(DEFAULT_QUIET_HOURS, NOON), null);
    // Winter time (UTC+1): 07:00 is 06:00 UTC.
    assert.equal(quietHoursEnd(DEFAULT_QUIET_HOURS, new Date("2026-12-01T22:00:00Z"))?.toISOString(), "2026-12-02T06:00:00.000Z");
  });

  it("scheduled times are due from that minute, for a while", () => {
    assert.equal(isTimeDue("08:00", new Date("2026-10-03T06:00:00Z")), true);
    assert.equal(isTimeDue("08:00", new Date("2026-10-03T05:59:00Z")), false);
    assert.equal(isTimeDue("08:00", new Date("2026-10-03T09:30:00Z")), false);
  });
});

describe("decideDelivery (preference filtering)", () => {
  const kind = (id: string) => {
    const found = KINDS.includes(id) ? id : "testn.normal";
    return { id: found, group: "household" as const, titleKey: "x:y", descriptionKey: "x:y", ...(found === "testn.urgent" && { urgent: true }), ...(found === "testn.owners" && { roles: ["owner" as const] }), ...(found === "testn.scoped" && { scoped: true }), ...(found === "testn.off" && { defaultEnabled: ["owner" as const] }) };
  };

  it("pushes at once outside quiet hours, holds inside", () => {
    assert.deepEqual(decideDelivery({ kind: kind("testn.normal"), role: "adult", preferences: prefs(), now: NOON }), { deliver: true, push: "now" });
    const late = decideDelivery({ kind: kind("testn.normal"), role: "adult", preferences: prefs(), now: LATE });
    assert.equal(late.deliver && late.push, "held");
  });

  it("urgent kinds bypass quiet hours", () => {
    assert.deepEqual(decideDelivery({ kind: kind("testn.urgent"), role: "child", preferences: prefs(), now: LATE }), { deliver: true, push: "now" });
    assert.deepEqual(decideDelivery({ kind: kind("testn.normal"), role: "adult", preferences: prefs(), now: LATE, urgent: true }), { deliver: true, push: "now" });
  });

  it("quiet hours switched off never hold", () => {
    assert.deepEqual(decideDelivery({ kind: kind("testn.normal"), role: "adult", preferences: prefs({ quietHours: { ...DEFAULT_QUIET_HOURS, enabled: false } }), now: LATE }), { deliver: true, push: "now" });
  });

  it("respects role limits, the person's choice and role defaults", () => {
    assert.deepEqual(decideDelivery({ kind: kind("testn.owners"), role: "adult", preferences: prefs(), now: NOON }), { deliver: false, reason: "role" });
    assert.deepEqual(decideDelivery({ kind: kind("testn.normal"), role: "adult", preferences: prefs({ kinds: { "testn.normal": { enabled: false } } }), now: NOON }), { deliver: false, reason: "disabled" });
    assert.deepEqual(decideDelivery({ kind: kind("testn.off"), role: "adult", preferences: prefs(), now: NOON }), { deliver: false, reason: "disabled" });
    assert.equal(decideDelivery({ kind: kind("testn.off"), role: "owner", preferences: prefs(), now: NOON }).deliver, true);
    assert.equal(decideDelivery({ kind: kind("testn.off"), role: "adult", preferences: prefs({ kinds: { "testn.off": { enabled: true } } }), now: NOON }).deliver, true);
  });

  it("scoped kinds only reach followers of that thing", () => {
    const following = prefs({ kinds: { "testn.scoped": { enabled: true, scope: ["device:d1"] } } });
    assert.equal(decideDelivery({ kind: kind("testn.scoped"), role: "adult", preferences: following, now: NOON, scopeIds: ["device:d1", "profile:p1"] }).deliver, true);
    assert.deepEqual(decideDelivery({ kind: kind("testn.scoped"), role: "adult", preferences: following, now: NOON, scopeIds: ["device:d2"] }), { deliver: false, reason: "scope" });
    assert.deepEqual(decideDelivery({ kind: kind("testn.scoped"), role: "adult", preferences: prefs(), now: NOON, scopeIds: ["device:d1"] }), { deliver: false, reason: "scope" });
  });

  it("resolves times: the stored one when it is offered, else the default", () => {
    const info = kindInfoFor({ id: "testn.timed", group: "tasks", titleKey: "a:b", descriptionKey: "a:b", times: ["07:00", "08:00"], defaultTime: "08:00" }, "adult");
    assert.equal(resolveKindPreference(info, undefined).time, "08:00");
    assert.equal(resolveKindPreference(info, { enabled: true, time: "07:00" }).time, "07:00");
    assert.equal(resolveKindPreference(info, { enabled: true, time: "03:00" }).time, "08:00");
  });

  it("parses stored preferences, dropping what is malformed", () => {
    const parsed = parsePreferences({ quietHoursEnabled: true, quietStart: "25:00", quietEnd: "07:00", kinds: { a: { enabled: false }, b: { enabled: "yes" } } });
    assert.deepEqual(parsed, { quietHours: DEFAULT_QUIET_HOURS, kinds: { a: { enabled: false } } });
    assert.deepEqual(parsePreferences(null), { quietHours: DEFAULT_QUIET_HOURS, kinds: {} });
  });
});

/** An in-memory notifier: stored rows, pushes and SSE events are recorded. */
function memoryNotifier(recipients: Recipient[], now: Date) {
  const rows: (StoredNotification & { id: string; createdAt: Date })[] = [];
  const pushes: { userId: string; title: string; urgent: boolean; topic?: string }[] = [];
  const changed: string[][] = [];
  const deps: NotifierDeps = {
    now: () => now,
    recipients: async (input) =>
      recipients.filter((recipient) => (!input.userIds || input.userIds.includes(recipient.userId)) && !input.excludeUserIds?.includes(recipient.userId)),
    hasRecentTag: async (userId, tag, since) => rows.some((row) => row.userId === userId && row.tag === tag && row.createdAt >= since),
    create: async (row) => {
      const id = `n${rows.length + 1}`;
      rows.push({ ...row, id, createdAt: now });
      return { id };
    },
    unreadCount: async (userId) => rows.filter((row) => row.userId === userId).length,
    push: async (userId, payload, options) => {
      pushes.push({ userId, title: payload.title, urgent: payload.urgent, topic: options.topic });
      return { sent: 1, failed: 0, removed: 0 };
    },
    markPushed: async () => undefined,
    changed: (_householdId, userIds) => changed.push(userIds),
  };
  return { notify: createNotifier(deps), rows, pushes, changed };
}

const people: Recipient[] = [
  { userId: "rob", role: "owner", locale: "nl", preferences: prefs() },
  { userId: "clara", role: "adult", locale: "en", preferences: prefs({ kinds: { "testn.normal": { enabled: false } } }) },
  { userId: "lotte", role: "child", locale: "nl", preferences: prefs() },
];
const content = (locale: string) => ({ title: locale === "nl" ? "Hallo" : "Hello", body: "…" });

describe("notify()", () => {
  it("stores and pushes per person, in their language, skipping who turned it off", async () => {
    const memory = memoryNotifier(people, NOON);
    const result = await memory.notify({ householdId: "h", kind: "testn.normal", content, tag: "t1" });
    assert.deepEqual(result, { stored: 2, pushedNow: 2, held: 0, skipped: 1 });
    assert.deepEqual(memory.rows.map((row) => [row.userId, row.title]), [["rob", "Hallo"], ["lotte", "Hallo"]]);
    assert.deepEqual(memory.changed, [["rob", "lotte"]]);
    assert.ok(memory.pushes.every((push) => push.topic && push.topic.length <= 32));
  });

  it("holds pushes during quiet hours (stored, pushed later), urgent ones go now", async () => {
    const memory = memoryNotifier(people, LATE);
    const held = await memory.notify({ householdId: "h", kind: "testn.normal", content });
    assert.equal(held.held, 2);
    assert.equal(memory.pushes.length, 0);
    assert.equal(memory.rows[0]?.pushHeldUntil?.toISOString(), "2026-10-04T05:00:00.000Z");
    const urgent = await memory.notify({ householdId: "h", kind: "testn.urgent", content });
    assert.deepEqual(urgent, { stored: 3, pushedNow: 3, held: 0, skipped: 0 });
    assert.ok(memory.pushes.every((push) => push.urgent));
  });

  it("de-duplicates by tag per person within the window", async () => {
    const memory = memoryNotifier(people, NOON);
    await memory.notify({ householdId: "h", kind: "testn.urgent", content, tag: "bins:2026-10-07", userIds: ["rob"] });
    const second = await memory.notify({ householdId: "h", kind: "testn.urgent", content, tag: "bins:2026-10-07" });
    assert.deepEqual(second, { stored: 2, pushedNow: 2, held: 0, skipped: 1 });
    assert.deepEqual(memory.rows.map((row) => row.userId), ["rob", "clara", "lotte"]);
    const noDedupe = await memory.notify({ householdId: "h", kind: "testn.urgent", content, tag: "bins:2026-10-07", dedupeMinutes: 0, userIds: ["rob"] });
    assert.equal(noDedupe.stored, 1);
  });

  it("refuses unknown kinds", async () => {
    await assert.rejects(memoryNotifier(people, NOON).notify({ householdId: "h", kind: "nope.nope", content }), /Unknown notification kind/);
  });
});

describe("push delivery", () => {
  it("removes subscriptions the push service says are gone (404/410), counts other failures", async () => {
    const subscriptions: SubscriptionRow[] = ["ok", "gone410", "gone404", "down"].map((id) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" }));
    const log: string[] = [];
    const store: PushStore = {
      listSubscriptions: async () => subscriptions,
      succeeded: async (id) => void log.push(`ok ${id}`),
      failed: async (id, _at, error) => void log.push(`failed ${id} ${error}`),
      remove: async (id) => void log.push(`removed ${id}`),
    };
    const status: Record<string, number> = { ok: 201, gone410: 410, gone404: 404, down: 503 };
    const outcome = await pushToSubscriptions(
      "rob",
      { id: "n1", kind: "testn.normal", title: "T", body: "B", url: null, tag: null, urgent: false, unread: 1 },
      {},
      {
        store,
        keys: { ...generateVapidKeys(), subject: "https://home.example.be" },
        send: async (target) => {
          const code = status[target.endpoint.split("/").at(-1) ?? ""] ?? 500;
          return code < 300 ? { ok: true, status: code } : { ok: false, status: code, gone: code === 404 || code === 410, error: `HTTP ${code}` };
        },
      },
    );
    assert.deepEqual(outcome, { sent: 1, failed: 1, removed: 2 });
    assert.deepEqual(log, ["ok ok", "removed gone410", "removed gone404", "failed down HTTP 503"]);
  });

  it("only sends to known push services over https", () => {
    assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc", false), true);
    assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/QAbc", false), true);
    assert.equal(isAllowedPushEndpoint("https://wns2-am3p.notify.windows.com/w/?token=x", false), true);
    assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/x", false), false);
    assert.equal(isAllowedPushEndpoint("https://192.168.1.10:8123/api", false), false);
    assert.equal(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com", false), false);
    assert.equal(isAllowedPushEndpoint("http://127.0.0.1:9999/push", false), false);
    assert.equal(isAllowedPushEndpoint("http://127.0.0.1:9999/push", true), true);
  });

  it("sends a VAPID-signed, aes128gcm-encrypted request a browser can decrypt", async () => {
    const browser = createECDH("prime256v1");
    const uaPublic = browser.generateKeys();
    const authSecret = randomBytes(16);
    const keys = { ...generateVapidKeys(), subject: "mailto:rob@example.com" };
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const payload = { title: "Put out tonight: Pmd", body: "Collection tomorrow", url: "/tasks/t1" };
    const result = await sendPush(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: uaPublic.toString("base64url"), auth: authSecret.toString("base64url") },
      payload,
      keys,
      { urgency: "high", ttlSeconds: 60, topic: "waste" },
      fakeFetch,
    );
    assert.deepEqual(result, { ok: true, status: 201 });
    assert.ok(captured);
    const { url, init } = captured as { url: string; init: RequestInit };
    assert.equal(url, "https://fcm.googleapis.com/fcm/send/abc");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["Content-Encoding"], "aes128gcm");
    assert.equal(headers.TTL, "60");
    assert.equal(headers.Urgency, "high");
    assert.equal(headers.Topic, "waste");

    // VAPID: `vapid t=<jwt>, k=<our public key>`, the JWT signed by our key for the push service's origin.
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization ?? "");
    assert.ok(match);
    const [, jwt = "", k = ""] = match;
    assert.equal(k, keys.publicKey);
    const [header = "", claims = "", signature = ""] = jwt.split(".");
    const parsedClaims = JSON.parse(Buffer.from(claims, "base64url").toString()) as { aud: string; sub: string; exp: number };
    assert.equal(parsedClaims.aud, "https://fcm.googleapis.com");
    assert.equal(parsedClaims.sub, "mailto:rob@example.com");
    assert.ok(parsedClaims.exp * 1000 > Date.now() && parsedClaims.exp * 1000 <= Date.now() + 24 * 3600_000);
    const pub = Buffer.from(keys.publicKey, "base64url");
    const verifier = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
    assert.ok(verify("sha256", Buffer.from(`${header}.${claims}`), { key: verifier, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));

    // RFC 8291 decryption, as the browser does it.
    const body = Buffer.from(init.body as Uint8Array);
    const salt = body.subarray(0, 16);
    const idLength = body.readUInt8(20);
    const asPublic = body.subarray(21, 21 + idLength);
    const record = body.subarray(21 + idLength);
    const zero = Buffer.from([0]);
    const keyInfo = Buffer.concat([Buffer.from("WebPush: info"), zero, uaPublic, asPublic]);
    const ikm = Buffer.from(hkdfSync("sha256", browser.computeSecret(asPublic), authSecret, keyInfo, 32));
    const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), zero]), 16));
    const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: nonce"), zero]), 12));
    const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(record.subarray(record.length - 16));
    const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
    assert.equal(plain.at(-1), 2);
    assert.deepEqual(JSON.parse(plain.subarray(0, -1).toString("utf8")), payload);
  });

  it("answers 410 as gone, network errors as a failure", async () => {
    const browser = createECDH("prime256v1");
    const target = { endpoint: "https://fcm.googleapis.com/x", p256dh: browser.generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") };
    const keys = { ...generateVapidKeys(), subject: "https://home.example.be" };
    const gone = await sendPush(target, {}, keys, {}, (async () => new Response(null, { status: 410 })) as typeof fetch);
    assert.deepEqual(gone, { ok: false, status: 410, gone: true, error: "HTTP 410" });
    const down = await sendPush(target, {}, keys, {}, (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch);
    assert.deepEqual(down, { ok: false, status: null, gone: false, error: "ECONNRESET" });
  });
});

describe("feature rules", () => {
  const task = (id: string, dueDate: string | null, assigneeIds: string[] = [], title = id): DigestTask => ({ id, title, dueDate, assigneeIds, rotateAssignees: false });

  it("builds the morning digest: mine and nobody's, overdue first; nothing → null", () => {
    const tasks = [task("a", "2026-10-03", ["rob"], "Mow the lawn"), task("b", "2026-10-01", ["rob"], "Pay Fluvius"), task("c", "2026-10-03", [], "Water the plants"), task("d", "2026-10-03", ["clara"]), task("e", "2026-10-05", ["rob"]), task("f", null, ["rob"])];
    const en = buildTaskDigest({ tasks, habitantId: "rob", today: "2026-10-03", locale: "en" });
    assert.deepEqual(en, { title: "Today: 3 tasks (1 overdue)", body: "Overdue: Pay Fluvius · Today: Mow the lawn and Water the plants", count: 3, overdue: 1, url: "/tasks" });
    const nl = buildTaskDigest({ tasks, habitantId: "rob", today: "2026-10-03", locale: "nl" });
    assert.equal(nl?.title, "Vandaag: 3 taken (1 te laat)");
    assert.equal(nl?.body, "Te laat: Pay Fluvius · Vandaag: Mow the lawn en Water the plants");
    assert.equal(buildTaskDigest({ tasks: [task("d", "2026-10-03", ["clara"])], habitantId: "rob", today: "2026-10-03", locale: "en" }), null);
    // Someone without a habitant only gets nobody's tasks.
    assert.equal(buildTaskDigest({ tasks, habitantId: null, today: "2026-10-03", locale: "en" })?.count, 1);
  });

  it("digest with rotation: only the one on duty", () => {
    const rotating: DigestTask = { id: "r", title: "Dishes", dueDate: "2026-10-03", assigneeIds: ["clara", "rob"], rotateAssignees: true };
    assert.equal(buildTaskDigest({ tasks: [rotating], habitantId: "rob", today: "2026-10-03", locale: "en" }), null);
    assert.equal(buildTaskDigest({ tasks: [rotating], habitantId: "clara", today: "2026-10-03", locale: "en" })?.count, 1);
  });

  it("bins: at the task's time (for a few hours) or the chosen evening hour", () => {
    const bins = { originDate: "2026-10-07", dueDate: "2026-10-06", dueTime: "20:00" };
    assert.equal(binsReminderDue(bins, "task", new Date("2026-10-06T18:00:00Z")), true);
    assert.equal(binsReminderDue(bins, "task", new Date("2026-10-06T17:59:00Z")), false);
    assert.equal(binsReminderDue(bins, "task", new Date("2026-10-06T22:30:00Z")), false);
    assert.equal(binsReminderDue(bins, "19:00", new Date("2026-10-06T17:05:00Z")), true);
    assert.equal(binsReminderDue(bins, "19:00", new Date("2026-10-07T17:05:00Z")), false);
  });

  it("vouchers: a week ahead, then the last day", () => {
    assert.equal(voucherReminder("2026-10-10", "2026-10-02"), null);
    assert.equal(voucherReminder("2026-10-10", "2026-10-03"), "week");
    assert.equal(voucherReminder("2026-10-10", "2026-10-09"), "last");
    assert.equal(voucherReminder("2026-10-10", "2026-10-11"), null);
  });

  it("alarm: triggered is urgent; armed/disarmed only between settled states", () => {
    assert.deepEqual(alarmChangeOf("armed_away", "triggered"), { kind: "alarm.triggered", state: "triggered" });
    assert.deepEqual(alarmChangeOf("disarmed", "armed_away"), { kind: "alarm.armed", state: "armed_away" });
    assert.deepEqual(alarmChangeOf("arming", "armed_home"), { kind: "alarm.armed", state: "armed_home" });
    assert.deepEqual(alarmChangeOf("triggered", "disarmed"), { kind: "alarm.armed", state: "disarmed" });
    assert.equal(alarmChangeOf("disarmed", "arming"), null);
    assert.equal(alarmChangeOf("unavailable", "disarmed"), null);
    assert.equal(alarmChangeOf("armed_away", "armed_away"), null);
  });
});
