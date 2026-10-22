/**
 * Runtime check of notifications (docs/NOTIFICATIONS.md) on a throwaway copy of the development database
 * (pg_dump → a new database, dropped afterwards). Never touches the real data or real push services.
 *
 *   npx tsx scripts/notifications-runtime-check.ts
 *
 * Starts a fake push service (records every request, answers 201, or 410 for endpoints with "/gone") and the
 * app on APP_PORT with every job paused, a throwaway INTEGRATIONS_KEY and WEB_PUSH_ALLOW_LOCAL_ENDPOINTS. Signs
 * in as the first owner (a session added to the copy) and checks: the VAPID key is generated and stored
 * encrypted; subscribing; the test notification arrives with valid VAPID headers and a payload that decrypts
 * like a browser would; a 410 removes that subscription; then, in this process against the same copy and with
 * a chosen clock, the bins, task digest and payment notifiers, the alarm going off during quiet hours (pushed
 * at once) versus a normal one (held, then delivered once quiet hours end), de-duplication on a second run, the
 * unread count, mark all read and its live event, and removing a device.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createDecipheriv, createECDH, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import pg from "pg";
import { zonedParts, zonedToUtc } from "../src/features/calendar/types/calendar-time";
import { addDays, todayIn } from "../src/types/dates";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const APP_PORT = Number(process.env.APP_PORT ?? 3197);
const FAKE_PORT = Number(process.env.FAKE_PUSH_PORT ?? 3196);
const DB = `wh_notify_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
const APP = `http://127.0.0.1:${APP_PORT}`;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const INTEGRATIONS_KEY = randomBytes(32).toString("base64");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function sql<T = Record<string, unknown>>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

let cookie = "";
const call = (method: string, path: string, body?: unknown) =>
  fetch(`${APP}${path}`, {
    method,
    headers: { "X-WickedHome": "1", ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const json = async <T>(response: Response) => (await response.json()) as T;

// ── The fake push service ────────────────────────────────────────────────────────────────────────────

type Recorded = { path: string; headers: IncomingHttpHeaders; body: Buffer };
const received: Recorded[] = [];
const fakePush = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
    res.statusCode = (req.url ?? "").includes("/gone") ? 410 : 201;
    res.end();
  });
});

/** The browser: a P-256 key pair and auth secret; decrypts what the server sent (RFC 8291). */
const browser = createECDH("prime256v1");
const uaPublic = browser.generateKeys();
const authSecret = randomBytes(16);
function decrypt(body: Buffer): { title?: string; body?: string; url?: string; urgent?: boolean; unread?: number } {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const record = body.subarray(21 + idLength);
  const zero = Buffer.from([0]);
  const ikm = Buffer.from(hkdfSync("sha256", browser.computeSecret(asPublic), authSecret, Buffer.concat([Buffer.from("WebPush: info"), zero, uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), zero]), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: nonce"), zero]), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, -1).toString("utf8")) as ReturnType<typeof decrypt>;
}
const okEndpoint = `${FAKE}/push/ok-${process.pid}`;
const goneEndpoint = `${FAKE}/push/gone-${process.pid}`;
/** Pushes that reached "the phone" since index `from`, decrypted. */
const pushesSince = (from: number) => received.slice(from).filter((entry) => entry.path.includes("/ok-")).map((entry) => ({ ...entry, message: decrypt(entry.body) }));

let app: ChildProcess | null = null;
let appLog = "";

async function main() {
  await new Promise<void>((resolve) => fakePush.listen(FAKE_PORT, "127.0.0.1", resolve));
  await sql(BASE_URL as string, `CREATE DATABASE "${DB}"`);
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-acl "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], {
    env: { ...process.env, SRC: BASE_URL, DST: testUrl },
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`copied the development database to ${DB}`);
  // Every job paused: nothing runs by itself; this check calls the notifiers with its own clock.
  const known = (await sql<{ jobId: string }>(testUrl, `SELECT DISTINCT "jobId" FROM job_runs`)).map((row) => row.jobId);
  const jobs = [...new Set([...known, "notifications.dispatch", "notifications.prune", "waste.sync", "tasks.pay-tasks", "expenses.auto-pay", "income.voucher-tasks"])];
  await sql(testUrl, `INSERT INTO job_settings ("jobId", enabled, "updatedAt") SELECT unnest($1::text[]), false, now() ON CONFLICT ("jobId") DO UPDATE SET enabled = false`, [jobs]);
  await sql(testUrl, `DELETE FROM web_push_keys`);

  const [owner] = await sql<{ id: string; householdId: string; locale: string }>(
    testUrl,
    `SELECT id, "householdId", locale FROM users WHERE role = 'OWNER' AND "disabledAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
  );
  if (!owner) throw new Error("No owner in the development database");
  const nl = owner.locale === "nl";
  const token = randomBytes(32).toString("base64url");
  await sql(testUrl, `INSERT INTO sessions (id, "userId", "expiresAt") VALUES ($1, $2, now() + interval '1 day')`, [createHash("sha256").update(token).digest("hex"), owner.id]);
  cookie = `wh_session=${token}`;

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DATABASE_URL: testUrl,
    PORT: String(APP_PORT),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    INTEGRATIONS_KEY,
    WEB_PUSH_ALLOW_LOCAL_ENDPOINTS: "true",
    HOME_ASSISTANT_HOUSEHOLD_ID: owner.householdId,
  };
  for (const key of Object.keys(env)) if (/^(GOOGLE_|ASSISTANT_|HOME_ASSISTANT_URL|HOME_ASSISTANT_TOKEN|VAPID_)/.test(key)) delete env[key];
  app = spawn("node_modules/.bin/tsx", ["src/api/server.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout?.on("data", (chunk) => (appLog += chunk));
  app.stderr?.on("data", (chunk) => (appLog += chunk));
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await fetch(`${APP}/api/health`).then((response) => response.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (attempt === 89) throw new Error(`app did not start:\n${appLog.slice(-2000)}`);
  }

  // ── Keys, settings, subscribing ─────────────────────────────────────────────────────────────────
  type Settings = { publicKey: string; keyStorage: string | null; kinds: { id: string }[]; devices: { id: string; endpoint: string; lastSuccessAt: string | null }[] };
  const settings = await json<Settings>(await call("GET", "/api/notifications/settings"));
  const [keyRow] = await sql<{ publicKey: string; privateKey: string }>(testUrl, `SELECT "publicKey", "privateKey" FROM web_push_keys WHERE id = 'vapid'`);
  check("VAPID key generated once and stored encrypted", keyRow?.publicKey === settings.publicKey && Boolean(keyRow?.privateKey.startsWith("v1.")), settings.keyStorage ?? "");
  check("settings never contain the private key", !JSON.stringify(settings).includes(keyRow?.privateKey ?? "-"));
  const kindIds = settings.kinds.map((kind) => kind.id);
  check(
    "kinds registered by the features",
    ["waste.bins", "tasks.digest", "tasks.payments", "tasks.assigned", "alarm.triggered", "alarm.armed", "home-assistant.connection", "devices.indicator", "income.vouchers", "integrations.mail-bills", "auth.invite-accepted", "expenses.auto-paid"].every((id) => kindIds.includes(id)) &&
      !kindIds.includes("notifications.test"),
    kindIds.join(", "),
  );
  check("quiet hours off for the flows below", (await call("PUT", "/api/notifications/preferences", { quietHours: { enabled: false, start: "22:00", end: "07:00" } })).ok);

  const keys = { p256dh: uaPublic.toString("base64url"), auth: authSecret.toString("base64url") };
  const refused = await call("POST", "/api/notifications/devices", { endpoint: "https://evil.example/push", keys });
  check("an unknown push service is refused", refused.status === 400, String(refused.status));
  const ok = await call("POST", "/api/notifications/devices", { endpoint: okEndpoint, keys });
  const gone = await call("POST", "/api/notifications/devices", { endpoint: goneEndpoint, keys });
  check("two devices subscribed", ok.status === 201 && gone.status === 201, `${ok.status}/${gone.status}`);

  // ── Test notification over real HTTP ────────────────────────────────────────────────────────────
  let mark = received.length;
  const test = await json<{ devices: number; pushed: boolean }>(await call("POST", "/api/notifications/test"));
  check("test notification pushed", test.pushed && test.devices === 2, JSON.stringify(test));
  const [first] = pushesSince(mark);
  const auth = String(first?.headers.authorization ?? "");
  const jwt = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
  const claims = jwt ? (JSON.parse(Buffer.from(jwt[1]?.split(".")[1] ?? "", "base64url").toString()) as { aud: string; sub: string; exp: number }) : null;
  check("VAPID header: our public key, JWT for the push service origin", jwt?.[2] === settings.publicKey && claims?.aud === FAKE && /^(mailto:|https:)/.test(claims?.sub ?? ""), auth.slice(0, 60));
  check(
    "encrypted payload (aes128gcm) decrypts on the phone",
    first?.headers["content-encoding"] === "aes128gcm" && first.message.title === (nl ? "Testmelding" : "Test notification") && first.message.url === "/notifications",
    JSON.stringify(first?.message),
  );
  check("urgent → Urgency: high", first?.headers.urgency === "high", String(first?.headers.urgency));
  const goneLeft = await sql(testUrl, `SELECT 1 FROM push_subscriptions WHERE endpoint = $1`, [goneEndpoint]);
  const okRow = await sql<{ lastSuccessAt: Date | null }>(testUrl, `SELECT "lastSuccessAt" FROM push_subscriptions WHERE endpoint = $1`, [okEndpoint]);
  check("410 from the push service removed that subscription", received.some((entry) => entry.path.includes("/gone-")) && goneLeft.length === 0);
  check("success recorded on the working one", okRow[0]?.lastSuccessAt != null);

  // ── Feature notifiers, in this process with a chosen clock ──────────────────────────────────────
  Object.assign(process.env, env, { DATABASE_URL: testUrl });
  const { listScheduledNotifiers } = await import("../src/api/notifications/scheduled-notifiers");
  await import("../src/api/waste/waste.notifications");
  await import("../src/api/tasks/task-notifications");
  await import("../src/api/income/income.notifications");
  const { handleAlarmStateChange } = await import("../src/api/home-assistant/ha-notifications");
  const { notify } = await import("../src/api/notifications/notify");
  const { deliverHeldPushes } = await import("../src/api/notifications/notifications.jobs");
  const { db } = await import("../src/api/lib/db");
  const run = async (id: string, now: Date) => {
    const notifier = listScheduledNotifiers().find((candidate) => candidate.id === id);
    if (!notifier) throw new Error(`notifier ${id} missing`);
    return notifier.run({ now, signal: new AbortController().signal, log: () => undefined });
  };
  const today = todayIn();
  const tomorrow = addDays(today, 1);
  const { householdId } = owner;

  // Bins: tomorrow's collection, task due tonight at 20:00, nobody assigned → everyone.
  await sql(testUrl, `DELETE FROM tasks WHERE "householdId" = $1 AND "originType" = 'waste' AND "originId" = $2`, [householdId, tomorrow]);
  await sql(
    testUrl,
    `INSERT INTO tasks (id, "householdId", title, type, status, "dueDate", "dueTime", "originType", "originId", "originDate", "originHref", "updatedAt")
     VALUES ($1, $2, 'Buitenzetten: Pmd', 'CHORE', 'OPEN', $3, '20:00', 'waste', $4, $5, '/settings#waste', now())`,
    [`nc-bins-${process.pid}`, householdId, today, tomorrow, tomorrow],
  );
  mark = received.length;
  const early = await run("waste.bins", zonedToUtc(today, "19:30"));
  const bins = await run("waste.bins", zonedToUtc(today, "20:05"));
  const binsPush = pushesSince(mark).find((entry) => /buitenzetten|Put out/i.test(entry.message.title ?? ""));
  check("bins: nothing before the task's time", early === 0, String(early));
  check("bins: \"Put out tonight\" to everyone at the task's time", bins >= 2 && Boolean(binsPush?.message.title?.startsWith(nl ? "Vanavond buitenzetten:" : "Put out tonight:")), `${bins} stored; ${binsPush?.message.title}`);
  check("bins: a second run sends nothing (tag de-dupe)", (await run("waste.bins", zonedToUtc(today, "20:10"))) === 0);

  // Task digest at 08:00 with an unassigned task due today.
  await sql(testUrl, `INSERT INTO tasks (id, "householdId", title, type, status, "dueDate", "updatedAt") VALUES ($1, $2, 'Runtime check digest', 'CHORE', 'OPEN', $3, now())`, [
    `nc-digest-${process.pid}`,
    householdId,
    today,
  ]);
  mark = received.length;
  const digest = await run("tasks.digest", zonedToUtc(today, "08:05"));
  const digestPush = pushesSince(mark).find((entry) => entry.message.url === "/tasks");
  check("task digest: one message at 08:00", digest >= 1 && Boolean(digestPush?.message.title?.startsWith(nl ? "Vandaag:" : "Today:")), `${digest}; ${digestPush?.message.title} — ${digestPush?.message.body}`);
  check("task digest: once per day", (await run("tasks.digest", zonedToUtc(today, "08:30"))) === 0);

  // Payment: a pay task due tomorrow (the expense due the day after).
  const [bill] = await sql<{ id: string }>(testUrl, `SELECT id FROM bills WHERE "householdId" = $1 ORDER BY "dueDate" DESC LIMIT 1`, [householdId]);
  if (bill) {
    await sql(testUrl, `DELETE FROM tasks WHERE "householdId" = $1 AND "originType" = 'expense' AND "originId" = $2`, [householdId, bill.id]);
    await sql(
      testUrl,
      `INSERT INTO tasks (id, "householdId", title, type, status, "dueDate", "originType", "originId", "originDate", "updatedAt") VALUES ($1, $2, 'Betaal check', 'ERRAND', 'OPEN', $3, 'expense', $4, $5, now())`,
      [`nc-pay-${process.pid}`, householdId, tomorrow, bill.id, addDays(tomorrow, 1)],
    );
    mark = received.length;
    const pay = await run("tasks.payments", zonedToUtc(today, "09:05"));
    const payPush = pushesSince(mark).find((entry) => entry.message.url === `/expenses/${bill.id}`);
    check("payments: \"Pay tomorrow\" at the chosen time", pay >= 1 && Boolean(payPush?.message.title?.startsWith(nl ? "Morgen betalen:" : "Pay tomorrow:")), `${pay}; ${payPush?.message.title}`);
  } else {
    check("payments: skipped (no expenses in the copy)", true);
  }

  // Quiet hours around now; the alarm still comes through at once, a normal one waits.
  const nowParts = zonedParts(new Date());
  const hhmm = (minutes: number) => `${String(Math.floor((((minutes % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((minutes % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
  await call("PUT", "/api/notifications/preferences", { quietHours: { enabled: true, start: hhmm(nowParts.minutes - 60), end: hhmm(nowParts.minutes + 60) } });
  const [haSettings] = await sql<{ alarmEntityId: string | null }>(testUrl, `SELECT "alarmEntityId" FROM home_assistant_settings WHERE "householdId" = $1`, [householdId]);
  const panel = haSettings?.alarmEntityId ?? "alarm_control_panel.check";
  mark = received.length;
  const at = new Date().toISOString();
  await handleAlarmStateChange(panel, { entity_id: panel, state: "triggered", attributes: { friendly_name: "Verisure" }, last_changed: at } as never, {
    entity_id: panel,
    state: "armed_away",
    attributes: {},
    last_changed: at,
  } as never);
  const alarmPush = pushesSince(mark).find((entry) => entry.message.urgent);
  check("alarm triggered: pushed at once in quiet hours, high urgency", Boolean(alarmPush) && alarmPush?.headers.urgency === "high", alarmPush?.message.title ?? "none");
  mark = received.length;
  const held = await notify({ householdId, kind: "tasks.assigned", userIds: [owner.id], url: "/tasks", content: () => ({ title: "Runtime check held", body: "…" }) });
  check("normal notification in quiet hours: stored, push held", held.stored === 1 && held.held === 1 && pushesSince(mark).length === 0, JSON.stringify(held));
  const delivered = await deliverHeldPushes(new Date(Date.now() + 2 * 3600_000), () => undefined);
  check("held push delivered once quiet hours end", delivered >= 1 && pushesSince(mark).some((entry) => entry.message.title === "Runtime check held"), String(delivered));

  // ── Unread count, mark all read (with its live event), remove device ────────────────────────────
  const [{ count }] = (await sql<{ count: string }>(testUrl, `SELECT count(*) FROM notifications WHERE "userId" = $1 AND "readAt" IS NULL`, [owner.id])) as [{ count: string }];
  const unread = await json<{ unread: number }>(await call("GET", "/api/notifications/unread-count"));
  check("unread count", unread.unread === Number(count) && unread.unread >= 4, `${unread.unread}`);
  const stream = await fetch(`${APP}/api/events`, { headers: { Cookie: cookie } });
  const reader = stream.body?.getReader();
  const readUntil = async (needle: string) => {
    let text = "";
    const deadline = Date.now() + 5000;
    while (reader && Date.now() < deadline && !text.includes(needle)) {
      const { value, done } = await Promise.race([reader.read(), new Promise<{ value: undefined; done: true }>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), 1000))]);
      if (value) text += Buffer.from(value).toString();
      else if (done && !reader) break;
    }
    return text;
  };
  await readUntil("event: ready");
  const markAll = await json<{ unread: number }>(await call("POST", "/api/notifications/read", {}));
  const live = await readUntil("event: notification.changed");
  await reader?.cancel();
  check("mark all read → 0", markAll.unread === 0);
  check("live event tells the bell", live.includes("event: notification.changed") && live.includes(owner.id));
  const page = await json<{ items: { readAt: string | null }[] }>(await call("GET", "/api/notifications?limit=5"));
  check("center lists them, read", page.items.length > 0 && page.items.every((item) => item.readAt !== null));

  const after = await json<Settings>(await call("GET", "/api/notifications/settings"));
  const device = after.devices.find((candidate) => candidate.endpoint === okEndpoint);
  const removed = await call("DELETE", `/api/notifications/devices/${device?.id ?? "x"}`);
  check("device removed", removed.status === 204 && (await sql(testUrl, `SELECT 1 FROM push_subscriptions WHERE endpoint = $1`, [okEndpoint])).length === 0);
  await db.$disconnect();
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error(error);
  })
  .finally(async () => {
    app?.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fakePush.close();
    await sql(BASE_URL as string, `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch((error: unknown) => console.error("drop failed", error));
    if (/\[notifications\].*(failed|error)/i.test(appLog)) console.log(`app log:\n${appLog.split("\n").filter((line) => line.includes("[notifications]")).join("\n")}`);
    console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
