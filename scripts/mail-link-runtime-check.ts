/**
 * Runtime check of linking mail bills to existing expenses, on a throwaway copy of the development database
 * (pg_dump → a new database, dropped afterwards). Never touches the real data.
 *
 *   npx tsx scripts/mail-link-runtime-check.ts
 *
 * Starts the app on APP_PORT (3197, 127.0.0.1) with every scheduled job paused and no Google credentials,
 * signs in as the first owner, adds a fake Google connection and fake mail suggestions to the copy, then
 * checks: the best match of a suggestion; linking to a one-off (fields applied, pay task follows the amount);
 * repeating the link (idempotent) and two links at once; the paid-expense guard; linking to a recurring
 * expense's occurrence beyond the generated horizon (materialised without gaps or doubles, template OGM for
 * upcoming instances); the remembered sender pre-matching the next suggestion; "From mail on …" origins.
 * The PDF can't be fetched without Google, so `attached` is false here (the attach code is the one Accept uses).
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { addDays, addMonthsClamped, todayIn } from "../src/types/dates";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const APP_PORT = Number(process.env.APP_PORT ?? 3197);
const DB = `wh_maillink_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
const APP = `http://127.0.0.1:${APP_PORT}`;

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
async function call(method: string, path: string, body?: unknown) {
  return fetch(`${APP}${path}`, {
    method,
    headers: { "X-WickedHome": "1", ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const json = async <T>(response: Response) => (await response.json()) as T;

/** A valid Belgian structured communication (12 digits) from a 10-digit base. */
const ogm = (base: string) => base + String(Number(BigInt(base) % 97n) || 97).padStart(2, "0");

let app: ChildProcess | null = null;
let appLog = "";

type Match = { expenseId: string | null; recurringExpenseId: string | null; dueDate: string; strong: boolean; reasons: string[] };
type Suggestion = { id: string; matches: Match[]; rememberedRecurringId: string | null };
type LinkResult = { expenseId: string; created: boolean; attached: boolean; updated: string[]; alreadyLinked: boolean };

async function main() {
  await sql(BASE_URL as string, `CREATE DATABASE "${DB}"`);
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-acl "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], {
    env: { ...process.env, SRC: BASE_URL, DST: testUrl },
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`copied the development database to ${DB}`);
  // Pause every job the copy knows plus the ones registered in code (they'd otherwise run their catch-up).
  await sql(
    testUrl,
    `INSERT INTO job_settings ("jobId", enabled, "updatedAt")
     SELECT id, false, now() FROM (SELECT unnest($1::text[]) AS id UNION SELECT "jobId" FROM job_settings) jobs
     ON CONFLICT ("jobId") DO UPDATE SET enabled = false`,
    [["expenses.auto-pay", "tasks.pay-tasks", "integrations.google-mail", "integrations.google-calendar", "income.voucher-tasks", "waste.sync", "home-assistant.energy", "home-assistant.refresh-states"]],
  );

  const [owner] = await sql<{ id: string; householdId: string }>(
    testUrl,
    `SELECT id, "householdId" FROM users WHERE role = 'OWNER' AND "disabledAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
  );
  if (!owner) throw new Error("No owner in the development database");
  const token = randomBytes(32).toString("base64url");
  await sql(testUrl, `INSERT INTO sessions (id, "userId", "expiresAt") VALUES ($1, $2, now() + interval '1 day')`, [createHash("sha256").update(token).digest("hex"), owner.id]);
  cookie = `wh_session=${token}`;
  // A fake Google connection for the suggestions to belong to (its token can't be read: no PDF download).
  await sql(
    testUrl,
    `INSERT INTO google_connections (id, "userId", "householdId", "googleAccountEmail", "googleSubject", "refreshTokenEnc", scopes, "updatedAt")
     VALUES ('gc-check', $1, $2, 'check@example.com', 'sub-check', 'v1.x.y.z', ARRAY['https://www.googleapis.com/auth/gmail.readonly'], now())
     ON CONFLICT ("userId") DO NOTHING`,
    [owner.id, owner.householdId],
  );
  const [connection] = await sql<{ id: string }>(testUrl, `SELECT id FROM google_connections WHERE "userId" = $1`, [owner.id]);

  const env: Record<string, string> = { ...(process.env as Record<string, string>), DATABASE_URL: testUrl, PORT: String(APP_PORT), HOST: "127.0.0.1", NODE_ENV: "test" };
  for (const key of Object.keys(env)) if (/^(GOOGLE_|INTEGRATIONS_KEY|ASSISTANT_|HOME_ASSISTANT_)/.test(key)) delete env[key];
  app = spawn("node_modules/.bin/tsx", ["src/api/server.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout?.on("data", (chunk) => (appLog += chunk));
  app.stderr?.on("data", (chunk) => (appLog += chunk));
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await fetch(`${APP}/api/health`).then((response) => response.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (attempt === 89) throw new Error(`app did not start:\n${appLog.slice(-2000)}`);
  }

  const today = todayIn();
  const pid = String(process.pid);
  const energy = `Linkcheck Energie ${pid}`;
  const rule = async (payee: string, sender: string, category: string) => {
    const response = await call("POST", "/api/integrations/google/mail/rules", { payee, senders: [sender], category });
    if (response.status !== 201) throw new Error(`rule: ${response.status} ${await response.text()}`);
    return (await json<{ id: string }>(response)).id;
  };
  const energyRule = await rule(energy, `linkcheck${pid}.be`, "energy");
  const waterRule = await rule(`Aquafin ${pid}`, `aquacheck${pid}.be`, "water");
  let messages = 0;
  const suggest = async (ruleId: string, payee: string, fields: { amountCents: number; dueDate: string; ogm?: string | null; iban?: string | null }) => {
    messages += 1;
    const [row] = await sql<{ id: string }>(
      testUrl,
      `INSERT INTO mail_bill_suggestions (id, "householdId", "connectionId", "ruleId", "gmailMessageId", "attachmentPartId", "attachmentName", payee, category, subject, "receivedAt", "amountCents", "dueDate", "structuredCommunication", iban, "dedupeKey")
       VALUES ($1, $2, $3, $4, $5, '2', 'factuur.pdf', $6, 'energy', 'Uw factuur', now(), $7, $8, $9, $10, $5) RETURNING id`,
      [`sg-${pid}-${messages}`, owner.householdId, connection?.id, ruleId, `msg-${pid}-${messages}`, payee, fields.amountCents, fields.dueDate, fields.ogm ?? null, fields.iban ?? null],
    );
    return row?.id ?? "";
  };
  const suggestions = async () => (await json<{ suggestions: Suggestion[] }>(await call("GET", "/api/integrations/google/mail/suggestions"))).suggestions;
  const link = (id: string, body: unknown) => call("POST", `/api/integrations/google/mail/suggestions/${id}/link`, body);

  // ── One-off ─────────────────────────────────────────────────────────────────────────────────────
  const oneOff = await json<{ id: string }>(
    await call("POST", "/api/expenses", { payee: energy, amountCents: 20_000, category: "energy", dueDate: addDays(today, 10), paymentMethod: "wire_transfer", payerType: "joint" }),
  );
  const payTask = async () =>
    (await sql<{ title: string }>(testUrl, `SELECT title FROM tasks WHERE "originType" = 'expense' AND "originId" = $1`, [oneOff.id]))[0]?.title ?? "(none)";
  const titleBefore = await payTask();
  const mailOgm = ogm(`0${pid.padStart(9, "0")}`.slice(-10));
  const s1 = await suggest(energyRule, energy, { amountCents: 21_234, dueDate: addDays(today, 12), ogm: mailOgm, iban: "BE68539007547034" });
  const best = (await suggestions()).find((item) => item.id === s1)?.matches[0];
  check("best match is the one-off", best?.expenseId === oneOff.id && best.strong, JSON.stringify(best));
  const options = await json<{ matches: Match[]; expenses: unknown[]; recurring: unknown[] }>(await call("GET", `/api/integrations/google/mail/suggestions/${s1}/link-options`));
  check("link options", options.matches[0]?.expenseId === oneOff.id && options.expenses.length > 0, `${options.matches.length} matches, ${options.expenses.length} expenses, ${options.recurring.length} recurring`);

  const body1 = { target: { expenseId: oneOff.id }, apply: ["amount", "dueDate", "structuredCommunication"] };
  const first = await link(s1, body1);
  const firstResult = await json<LinkResult>(first);
  check("linked to the one-off", first.status === 200 && !firstResult.alreadyLinked && firstResult.updated.length === 3, JSON.stringify(firstResult));
  const [updated] = await sql<{ amountCents: number; dueDate: Date; structuredCommunication: string | null; iban: string | null }>(
    testUrl,
    `SELECT "amountCents", "dueDate", "structuredCommunication", iban FROM bills WHERE id = $1`,
    [oneOff.id],
  );
  check(
    "chosen fields applied, IBAN left alone",
    updated?.amountCents === 21_234 && updated.structuredCommunication === mailOgm && updated.iban === null,
    JSON.stringify(updated),
  );
  const [s1Row] = await sql<{ status: string; expenseId: string }>(testUrl, `SELECT status, "expenseId" FROM mail_bill_suggestions WHERE id = $1`, [s1]);
  check("suggestion LINKED to the expense", s1Row?.status === "LINKED" && s1Row.expenseId === oneOff.id, JSON.stringify(s1Row));
  check("no longer suggested", !(await suggestions()).some((item) => item.id === s1));
  const titleAfter = await payTask();
  check("pay task follows the amount", /200[.,]00/.test(titleBefore) && /212[.,]34/.test(titleAfter), `${titleBefore} → ${titleAfter}`);
  const again = await json<LinkResult>(await link(s1, body1));
  check("linking again is a no-op", again.alreadyLinked && again.expenseId === oneOff.id, JSON.stringify(again));
  const elsewhere = await link(s1, { target: { expenseId: "someone-else" } });
  check("linking a handled mail elsewhere is refused", elsewhere.status === 409, String(elsewhere.status));
  await sql(testUrl, `UPDATE mail_bill_suggestions SET "documentFileId" = 'doc-check' WHERE id = $1`, [s1]);
  const origins = await json<{ origins: { documentFileId: string }[] }>(await call("GET", `/api/integrations/google/mail/origins?expenseId=${oneOff.id}`));
  check("\"From mail on …\" origin", origins.origins.length === 1 && origins.origins[0]?.documentFileId === "doc-check", JSON.stringify(origins));

  // ── Paid guard and a double tap ─────────────────────────────────────────────────────────────────
  const paid = await json<{ id: string }>(
    await call("POST", "/api/expenses", { payee: energy, amountCents: 5_000, category: "energy", dueDate: addDays(today, -3), paidOn: addDays(today, -3), payerType: "joint" }),
  );
  const s2 = await suggest(energyRule, energy, { amountCents: 5_500, dueDate: addDays(today, -3) });
  const refused = await link(s2, { target: { expenseId: paid.id }, apply: ["amount"] });
  const [stillPending] = await sql<{ status: string }>(testUrl, `SELECT status FROM mail_bill_suggestions WHERE id = $1`, [s2]);
  check("paid amount not changed without confirmation", refused.status === 400 && stillPending?.status === "PENDING", `${refused.status} ${stillPending?.status}`);
  const both = await Promise.all([1, 2].map(() => link(s2, { target: { expenseId: paid.id }, apply: ["amount"], allowPaidChanges: true }).then((response) => json<LinkResult>(response))));
  const [paidRow] = await sql<{ amountCents: number }>(testUrl, `SELECT "amountCents" FROM bills WHERE id = $1`, [paid.id]);
  check(
    "two links at once: one does it, one is a no-op",
    both.filter((result) => result.alreadyLinked === false).length === 1 && both.filter((result) => result.alreadyLinked).length === 1 && paidRow?.amountCents === 5_500,
    JSON.stringify(both),
  );

  // ── Recurring: an occurrence beyond the horizon ─────────────────────────────────────────────────
  const start = addDays(today, 5);
  const templateIban = "BE71096123456769";
  await call("POST", "/api/expenses", {
    payee: `Linkcheck Water ${pid}`,
    amountCents: 5_000,
    category: "water",
    dueDate: start,
    rrule: "FREQ=MONTHLY",
    kind: "utility",
    iban: templateIban,
    paymentMethod: "wire_transfer",
    payerType: "joint",
  });
  const [recurring] = await sql<{ id: string; generatedUntil: Date }>(testUrl, `SELECT id, "generatedUntil" FROM bill_series WHERE payee = $1`, [`Linkcheck Water ${pid}`]);
  const recurringId = recurring?.id ?? "";
  const beyond = addMonthsClamped(start, 14);
  const waterOgm = ogm(`1${pid.padStart(9, "0")}`.slice(-10));
  const s3 = await suggest(waterRule, `Aquafin ${pid}`, { amountCents: 5_300, dueDate: beyond, iban: templateIban, ogm: waterOgm });
  const virtual = (await suggestions()).find((item) => item.id === s3)?.matches[0];
  check("best match is a virtual occurrence beyond the horizon", virtual?.expenseId === null && virtual.recurringExpenseId === recurringId && virtual.dueDate === beyond, JSON.stringify(virtual));
  const occurrences = await json<{ occurrences: Match[]; suggested: string | null }>(
    await call("GET", `/api/integrations/google/mail/suggestions/${s3}/occurrences?recurringExpenseId=${recurringId}`),
  );
  check("occurrence choice suggests it", occurrences.suggested === beyond && occurrences.occurrences.some((item) => item.dueDate === beyond && item.expenseId === null), JSON.stringify(occurrences.suggested));
  const linked3 = await json<LinkResult>(
    await link(s3, { target: { recurringExpenseId: recurringId, dueDate: beyond }, apply: ["amount"], updateRecurring: ["structuredCommunication"], remember: true }),
  );
  check("linked to the occurrence, created", linked3.created && linked3.updated.join() === "amount", JSON.stringify(linked3));
  const instances = await sql<{ id: string; dueDate: Date; amountCents: number; structuredCommunication: string | null; paidOn: Date | null }>(
    testUrl,
    `SELECT id, "dueDate", "amountCents", "structuredCommunication", "paidOn" FROM bills WHERE "seriesId" = $1 ORDER BY "dueDate"`,
    [recurringId],
  );
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const materialised = instances.find((row) => iso(row.dueDate) === beyond);
  check("materialised with the mail's amount", materialised?.id === linked3.expenseId && materialised.amountCents === 5_300, JSON.stringify(materialised));
  check("horizon stays one range (no gaps)", instances.length === 15 && iso(instances[0]!.dueDate) === start, `${instances.length} instances`);
  const [template] = await sql<{ structuredCommunication: string | null; generatedUntil: Date }>(
    testUrl,
    `SELECT "structuredCommunication", "generatedUntil" FROM bill_series WHERE id = $1`,
    [recurringId],
  );
  check("generatedUntil moved to the occurrence", template && iso(template.generatedUntil) === beyond, template ? iso(template.generatedUntil) : "");
  const upcomingWithOgm = instances.filter((row) => row.structuredCommunication === waterOgm && row.id !== linked3.expenseId).length;
  check("template OGM set for it and its upcoming payments (not the linked one)", template?.structuredCommunication === waterOgm && upcomingWithOgm === 14 && materialised?.structuredCommunication === null, `${upcomingWithOgm}`);
  await call("GET", "/api/expenses");
  const [doubles] = await sql<{ count: string }>(testUrl, `SELECT count(*) FROM bills WHERE "seriesId" = $1 AND "dueDate" = $2`, [recurringId, beyond]);
  check("a later top-up doesn't create it again", doubles?.count === "1", doubles?.count);
  const [remembered] = await sql<{ recurringExpenseId: string | null }>(testUrl, `SELECT "recurringExpenseId" FROM mail_bill_rules WHERE id = $1`, [waterRule]);
  check("sender remembered on the rule", remembered?.recurringExpenseId === recurringId, JSON.stringify(remembered));

  // ── The remembered sender pre-matches the next mail ─────────────────────────────────────────────
  const next = addMonthsClamped(start, 15);
  const s4 = await suggest(waterRule, `Aquafin ${pid}`, { amountCents: 7_777, dueDate: addDays(next, 2) });
  const pre = (await suggestions()).find((item) => item.id === s4);
  const preBest = pre?.matches[0];
  check(
    "remembered sender pre-matched to the next occurrence",
    pre?.rememberedRecurringId === recurringId && preBest?.recurringExpenseId === recurringId && preBest.dueDate === next && preBest.reasons.includes("remembered") && preBest.strong,
    JSON.stringify(preBest),
  );
  const forget = await json<LinkResult>(await link(s4, { target: { recurringExpenseId: recurringId, dueDate: next }, remember: false }));
  const [forgotten] = await sql<{ recurringExpenseId: string | null }>(testUrl, `SELECT "recurringExpenseId" FROM mail_bill_rules WHERE id = $1`, [waterRule]);
  check("switching remember off forgets it", forget.created && forgotten?.recurringExpenseId === null, JSON.stringify(forgotten));

  check("no pg 'already executing a query' warning", !appLog.includes("already executing a query"));
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error(error);
  console.log(appLog.slice(-3000));
} finally {
  app?.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await sql(BASE_URL, `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  console.log(`dropped ${DB}`);
}
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
