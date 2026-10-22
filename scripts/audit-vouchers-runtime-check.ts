/**
 * Runtime check of the audit log and the meal voucher expiry, on a throwaway copy of the development database
 * (pg_dump → a new database, dropped afterwards). Never touches the real data.
 *
 *   npx tsx scripts/audit-vouchers-runtime-check.ts
 *
 * Starts the app on APP_PORT (3198, 127.0.0.1) with every scheduled job paused and no integrations (no Google,
 * Home Assistant or assistant credentials), signs in as the household's first owner by adding a session to the
 * copy, then checks: invites and account actions, balance corrections and an MCP write end up in the activity
 * log (filters, search, no secrets); meal vouchers can't be joint; the FIFO balance with an expiry warning; the
 * voucher task job; the audit retention job; and that pg never warned about overlapping queries.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { addDays, addMonthsClamped, todayIn } from "../src/types/dates";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const APP_PORT = Number(process.env.APP_PORT ?? 3198);
const DB = `wh_audit_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
const APP = `http://127.0.0.1:${APP_PORT}`;
const JOBS = [
  "assistant.cleanup", "audit.prune", "auth.cleanup", "documents.abandoned-uploads", "expenses.auto-pay", "home-assistant.energy",
  "home-assistant.refresh-states", "income.voucher-tasks", "integrations.google-calendar", "integrations.google-mail", "jobs.prune-runs",
  "shopping.barcode-cache", "shops.icons", "tasks.pay-tasks", "waste.sync",
];

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
async function call(method: string, path: string, body?: unknown, withSession = true) {
  return fetch(`${APP}${path}`, {
    method,
    headers: { "X-WickedHome": "1", ...(body !== undefined && { "Content-Type": "application/json" }), ...(withSession && cookie && { Cookie: cookie }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const json = async <T>(response: Response) => (await response.json()) as T;

let app: ChildProcess | null = null;
let appLog = "";

async function runJob(id: string): Promise<{ status?: string; summary?: string | null }> {
  await call("POST", `/api/jobs/${id}/run`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const job = await json<{ running: boolean; recentRuns: { status: string; summary: string | null }[] }>(await call("GET", `/api/jobs/${id}`));
    if (!job.running) return job.recentRuns[0] ?? {};
  }
  return {};
}

async function main() {
  await sql(BASE_URL as string, `CREATE DATABASE "${DB}"`);
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-acl "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], {
    env: { ...process.env, SRC: BASE_URL, DST: testUrl },
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`copied the development database to ${DB}`);
  await sql(testUrl, `INSERT INTO job_settings ("jobId", enabled, "updatedAt") SELECT unnest($1::text[]), false, now() ON CONFLICT ("jobId") DO UPDATE SET enabled = false`, [JOBS]);

  const [owner] = await sql<{ id: string; householdId: string }>(
    testUrl,
    `SELECT id, "householdId" FROM users WHERE role = 'OWNER' AND "disabledAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
  );
  if (!owner) throw new Error("No owner in the development database");
  const token = randomBytes(32).toString("base64url");
  await sql(testUrl, `INSERT INTO sessions (id, "userId", "expiresAt") VALUES ($1, $2, now() + interval '1 day')`, [createHash("sha256").update(token).digest("hex"), owner.id]);
  cookie = `wh_session=${token}`;

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
  const suffix = String(process.pid);

  // ── Accounts and invites ────────────────────────────────────────────────────────────────────────
  const name = `Audit Check ${suffix}`;
  const invite = await json<{ token: string; invite: { id: string } }>(
    await call("POST", "/api/auth/accounts/invites", { newHabitant: { name, type: "adult", color: "#3b82f6" }, role: "adult" }),
  );
  const accepted = await call("POST", "/api/auth/links/accept-invite", { token: invite.token, email: `audit-${suffix}@example.com`, password: "a-long-password-1", locale: "en" }, false);
  check("invite accepted", accepted.status === 201, String(accepted.status));
  const accounts = await json<{ accounts: { id: string; person: { name: string; habitantId: string } | null }[] }>(await call("GET", "/api/auth/accounts"));
  const account = accounts.accounts.find((item) => item.person?.name === name);
  const habitantId = account?.person?.habitantId ?? "";
  const accountId = account?.id ?? "";
  const statuses = [
    (await call("PUT", `/api/auth/accounts/${accountId}/role`, { role: "child" })).status,
    (await call("POST", `/api/auth/accounts/${accountId}/disable`)).status,
    (await call("POST", `/api/auth/accounts/${accountId}/enable`)).status,
    (await call("POST", `/api/auth/accounts/${accountId}/sign-out`)).status,
    (await call("POST", `/api/auth/accounts/${accountId}/reset-link`)).status,
    (await call("DELETE", `/api/auth/accounts/${accountId}`)).status,
  ];
  check("account actions", statuses.every((status) => status < 300), statuses.join(","));
  const revoked = await json<{ invite: { id: string } }>(
    await call("POST", "/api/auth/accounts/invites", { newHabitant: { name: `Audit Revoke ${suffix}`, type: "adult", color: "#22c55e" }, role: "child" }),
  );
  check("invite revoked", (await call("DELETE", `/api/auth/accounts/invites/${revoked.invite.id}`)).status === 204);

  // ── Balance corrections ─────────────────────────────────────────────────────────────────────────
  const created = await json<{ id: string }>(
    await call("POST", "/api/money/accounts", { name: `Audit account ${suffix}`, kind: "joint", ownerIds: "", openingBalanceCents: 100_000, openingDate: addDays(today, -5) }),
  );
  const corrected = await call("POST", `/api/money/accounts/${created.id}/balance`, { date: today, balanceCents: 123_456 });
  const [correction] = await sql<{ id: string }>(testUrl, `SELECT id FROM account_entries WHERE "accountId" = $1 AND type = 'CORRECTION' ORDER BY "createdAt" DESC LIMIT 1`, [created.id]);
  const removedCorrection = await call("DELETE", `/api/money/entries/${correction?.id ?? "x"}`);
  check("balance set and correction deleted", corrected.status === 201 && removedCorrection.status === 204, `${corrected.status},${removedCorrection.status}`);

  // ── MCP write (the tool runner) ─────────────────────────────────────────────────────────────────
  const mcpToken = await json<{ token: string }>(await call("POST", "/api/assistant/tokens", { name: "audit-check", scope: "write" }));
  const mcp = (args: Record<string, unknown>) =>
    fetch(`${APP}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${mcpToken.token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "shopping_add_item", arguments: args } }),
    }).then((response) => response.json() as Promise<{ result?: { isError?: boolean } }>);
  await mcp({ name: `audit milk ${suffix}` });
  const mcpDone = await mcp({ name: `audit milk ${suffix}`, confirm: true });
  check("MCP write with confirm", mcpDone.result?.isError === false);

  // ── Meal vouchers ───────────────────────────────────────────────────────────────────────────────
  const oldDate = addDays(today, -350);
  const expiry = addMonthsClamped(oldDate, 12);
  for (const [date, amountCents] of [[oldDate, 5_000], [addDays(today, -10), 3_000]] as const) {
    const income = await call("POST", "/api/income/incomes", { habitantId, date, amountCents, kind: "meal_vouchers" });
    if (income.status !== 201) check("voucher income", false, await income.text());
  }
  const expense = { payee: `Audit vouchers ${suffix}`, amountCents: 1_000, category: "groceries", dueDate: today, paidOn: today, paymentMethod: "meal_voucher" };
  const joint = await call("POST", "/api/expenses", { ...expense, payerType: "joint" });
  const jointBody = await json<{ error?: { fields?: Record<string, string[]> } }>(joint);
  check("meal vouchers can't be joint", joint.status === 400 && Boolean(jointBody.error?.fields?.payerType), `${joint.status} ${JSON.stringify(jointBody.error)}`);
  const personal = await call("POST", "/api/expenses", { ...expense, payerType: "person", payerHabitantId: habitantId });
  check("meal vouchers paid by a person", personal.status === 201, String(personal.status));
  const overview = await json<{ vouchers: { habitantId: string; availableCents: number; expiringSoon: { date: string; amountCents: number } | null }[] }>(
    await call("GET", `/api/income?month=${today.slice(0, 7)}`),
  );
  const balance = overview.vouchers.find((item) => item.habitantId === habitantId);
  check(
    "FIFO balance with expiry warning",
    balance?.availableCents === 7_000 && balance.expiringSoon?.date === expiry && balance.expiringSoon.amountCents === 4_000,
    JSON.stringify(balance),
  );

  const taskRun = await runJob("income.voucher-tasks");
  const tasks = await sql<{ title: string; status: string }>(testUrl, `SELECT title, status FROM tasks WHERE "originType" = 'vouchers' AND "originId" = $1`, [`${habitantId}:${expiry}`]);
  check("voucher task job", taskRun.status === "succeeded" && tasks.length === 1 && tasks[0]?.status === "OPEN", `${taskRun.status} ${taskRun.summary} ${JSON.stringify(tasks)}`);
  const again = await runJob("income.voucher-tasks");
  check("voucher task job is idempotent", again.status === "succeeded" && again.summary === "Voucher tasks up to date", String(again.summary));
  const pruneRun = await runJob("audit.prune");
  check("audit retention job", pruneRun.status === "succeeded", String(pruneRun.summary));

  // ── The activity log ────────────────────────────────────────────────────────────────────────────
  type Page = { entries: { action: string; channel: string; summary: string | null; targetLabel: string | null }[]; people: unknown[]; actions: string[] };
  const page = await json<Page>(await call("GET", "/api/audit?limit=200"));
  const actions = new Set(page.entries.map((entry) => entry.action));
  const expected = [
    "invite.created", "invite.accepted", "account.role_changed", "account.disabled", "account.enabled", "account.signed_out",
    "account.reset_link", "account.removed", "invite.revoked", "payment_account.corrected", "payment_account.correction_deleted", "shopping.add_item",
  ];
  const missing = expected.filter((action) => !actions.has(action));
  check("every action recorded", missing.length === 0, missing.join(", "));
  const mcpEntries = page.entries.filter((entry) => entry.action === "shopping.add_item" && entry.summary?.includes(suffix));
  check("MCP write recorded once, as mcp", mcpEntries.length === 1 && mcpEntries[0]?.channel === "mcp", JSON.stringify(mcpEntries));
  const role = page.entries.find((entry) => entry.action === "account.role_changed" && entry.targetLabel === name);
  check("role change summary", role?.summary === "Role: adult → child", String(role?.summary));
  const mcpOnly = await json<Page>(await call("GET", "/api/audit?channel=mcp"));
  check("channel filter", mcpOnly.entries.length > 0 && mcpOnly.entries.every((entry) => entry.channel === "mcp"));
  const search = await json<Page>(await call("GET", `/api/audit?q=${encodeURIComponent(`check ${suffix}`)}`));
  check("search", search.entries.length >= 8 && search.entries.every((entry) => JSON.stringify(entry).toLowerCase().includes(suffix)), String(search.entries.length));
  const domain = await json<Page>(await call("GET", "/api/audit?action=account."));
  check("action domain filter", domain.entries.length >= 6 && domain.entries.every((entry) => entry.action.startsWith("account.")));
  const raw = JSON.stringify(await sql(testUrl, "SELECT * FROM audit_entries"));
  check("no secrets in the log", !raw.includes(invite.token) && !raw.includes(mcpToken.token) && !raw.includes("a-long-password-1"));
  const child = await call("GET", "/api/audit", undefined, false);
  check("activity needs a session", child.status === 401, String(child.status));

  check("no pg 'already executing a query' warning", !appLog.includes("already executing a query"), appLog.match(/.*already executing.*/)?.[0] ?? "");
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
process.exit(failures === 0 ? 0 : 1);
