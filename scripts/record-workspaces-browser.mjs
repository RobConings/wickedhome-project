import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";
import { db } from "../src/api/lib/db.ts";
import { hashPassword } from "../src/api/lib/password.ts";
import { createIncome } from "../src/api/income/income.service.ts";
import { createPlan } from "../src/api/money/money.service.ts";
import { createContact, getContact } from "../src/api/contacts/contacts.service.ts";
import { audit, appActor } from "../src/api/audit/audit.service.ts";
import { incomeInputSchema } from "../src/features/income/types/income.ts";
import { contributionPlanSchema } from "../src/features/money/types/money.ts";
import { contactInputSchema } from "../src/features/contacts/types/contacts.ts";
import { addDays, todayIn } from "../src/types/dates.ts";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.match(database.pathname, /(?:test|ci)$/i, "Use a disposable test database");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname), "Only loopback databases");
const base = "http://127.0.0.1:55457";
const temporary = await mkdtemp(path.join(tmpdir(), "wh-record-workspaces-"));
let home, server, browser;
let logs = "";
const errors = [];
try {
  home = await db.household.create({ data: { name: "Record workspace fixture" } });
  const person = await db.habitant.create({ data: { householdId: home.id, name: "Workspace person", type: "ADULT", color: "#5683b2" } });
  const password = "Local-workspace-fixture-only-2026";
  const user = await db.user.create({ data: { householdId: home.id, habitantId: person.id, email: `${home.id}@example.test`, passwordHash: await hashPassword(password), role: "ADULT", locale: "en" } });
  const actor = { id: user.id, householdId: home.id, habitantId: person.id, role: "adult", locale: "en", name: person.name, email: user.email, householdName: home.name };
  const account = await db.paymentAccount.create({ data: { householdId: home.id, name: "Workspace account", kind: "JOINT", color: "#5683b2", isDefault: true } });
  const today = todayIn();
  const month = today.slice(0, 7);
  const plan = await createPlan(home.id, contributionPlanSchema.parse({ habitantId: person.id, accountId: account.id, amountCents: 30000, dayOfMonth: 1, activeFrom: `${month}-01` }));
  await createIncome(home.id, incomeInputSchema.parse({ habitantId: person.id, date: today, amountCents: 2500, kind: "meal_vouchers", description: "Workspace voucher credit" }));
  const contact = await createContact(actor, contactInputSchema.parse({ name: "Workspace supplier" }));
  const project = await db.project.create({ data: { householdId: home.id, name: "Workspace project", color: "#5683b2", status: "ACTIVE" } });
  const task = await db.task.create({ data: { householdId: home.id, title: "Workspace task", dueDate: new Date(`${today}T00:00:00.000Z`) } });
  const product = await db.product.create({ data: { householdId: home.id, name: "Workspace product", category: "OTHER" } });
  await audit(appActor(actor), { action: "inventory.save_product", targetType: "product", targetId: product.id, targetLabel: product.name, summary: "Workspace source link" });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(HOME_ASSISTANT_|ASSISTANT_|GOOGLE_|VAPID_|SMTP_|INTEGRATIONS_KEY)/.test(key)) delete env[key];
  Object.assign(env, { HOST: "127.0.0.1", PORT: "55457", PUBLIC_URL: base, COOKIE_SECURE: "false", NODE_ENV: "development", STORAGE_DIR: path.join(temporary, "files") });
  server = spawn(process.execPath, ["--import", "tsx", "src/api/server.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Local server did not start: ${logs}`)), 30000);
    const receive = (chunk) => { logs += String(chunk); if (logs.includes("WickedHome listening on")) { clearTimeout(timer); resolve(); } };
    server.stdout.on("data", receive); server.stderr.on("data", receive);
    server.once("exit", () => { clearTimeout(timer); reject(new Error(`Local server stopped: ${logs}`)); });
  });
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((candidate) => candidate && existsSync(candidate));
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 320, height: 850 } });
  const login = await context.request.post(`${base}/api/auth/login`, { headers: { "X-WickedHome": "1" }, data: { email: user.email, password } });
  assert.ok(login.ok(), await login.text());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${page.url()}`);
  const flow = process.env.WORKSPACE_BROWSER_FLOW ?? "all";
  const run = (name) => flow === "all" || flow === name;
  if (run("finance")) {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`${base}/income/vouchers/${person.id}`);
    await page.getByRole("heading", { name: "Workspace person’s meal vouchers", exact: true }).waitFor();
    await page.locator('a[href^="/income/receipts/"]').first().waitFor();
    await noOverflow();
    await page.goto(`${base}/money/plans/${plan.id}?month=${month}`);
    await page.getByRole("heading", { name: "Monthly contribution plan", exact: true }).waitFor();
    await noOverflow();
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole("button", { name: "Edit contribution", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Amount/).fill("275");
  await dialog.getByLabel("From", { exact: true }).fill(addDays(today, 1));
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/money/plans/") && url.pathname !== `/money/plans/${plan.id}`);
  await page.getByRole("heading", { name: "Monthly contribution plan", exact: true }).waitFor();
  assert.equal((await db.contributionPlan.findUniqueOrThrow({ where: { id: plan.id } })).activeTo.toISOString().slice(0, 10), today);
  }
  if (run("contacts")) {
  await page.goto(`${base}/contacts/${contact.id}`);
  await page.getByRole("heading", { name: contact.name, exact: true }).waitFor();
  await page.getByRole("button", { name: "Link a project", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: /Workspace project/ }).click();
  await dialog.getByLabel(/^Role in the project/).fill("Supplier");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("link", { name: project.name, exact: true }).waitFor();
  assert.equal((await getContact(home.id, contact.id)).projects[0]?.role, "Supplier");
  await noOverflow();
  await page.getByRole("button", { name: "Edit role", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Role in the project/).fill("Architect");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal((await getContact(home.id, contact.id)).projects[0]?.role, "Architect");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("link", { name: project.name, exact: true }).waitFor({ state: "hidden" });
  assert.equal((await getContact(home.id, contact.id)).projects.length, 0);
  }
  if (run("tasks")) {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto(`${base}/tasks/${task.id}`);
    await page.getByRole("heading", { name: task.title, exact: true }).waitFor();
    const management = page.getByRole("button", { name: "More task actions", exact: true });
    await management.click();
    await page.getByRole("menuitem", { name: /^Put on hold/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "More task actions");
    await management.click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "More task actions");
    await management.click();
    await page.getByRole("menuitem", { name: "Snooze", exact: true }).click();
    const refreshed = page.waitForResponse((response) => response.url().includes(`/api/tasks/${task.id}`) && response.request().method() === "GET");
    await page.getByRole("menuitem", { name: /Tomorrow/ }).click();
    await refreshed;
    const detail = await (await context.request.get(`${base}/api/tasks/${task.id}`)).json();
    assert.equal(detail.task.dueDate, addDays(today, 1));
    await noOverflow();
  }
  if (run("audit")) {
  await page.goto(`${base}/settings?section=activity&auditChannel=app&auditQ=Workspace`);
  await page.getByRole("link", { name: product.name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/inventory/products/${product.id}`);
  await page.getByRole("heading", { name: product.name, exact: true }).waitFor();
  await page.getByRole("link", { name: /^Back/ }).click();
  await page.waitForURL((url) => url.pathname === "/settings" && url.searchParams.get("auditQ") === "Workspace");
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`Local workspace journey passed (${flow}): owner actions, context, focus and phone layout.`);
} catch (error) {
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) console.error("Workspace location:", page.url(), "Visible headings:", await page.locator("h1").allTextContents().catch(() => []));
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  if (home) await db.household.delete({ where: { id: home.id } });
  await db.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}
