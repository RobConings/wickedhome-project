import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { db } from "../src/api/lib/db.ts";
import { hashPassword } from "../src/api/lib/password.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.match(
  url.pathname,
  /(?:test|ci)$/i,
  "Use a disposable test/CI database",
);
const base = process.env.SHOPPING_BROWSER_BASE_URL ?? "http://127.0.0.1:55441";
const address = new URL(base);
assert.ok(
  ["127.0.0.1", "localhost"].includes(address.hostname),
  "The browser test only runs against its own loopback server",
);
const temporary = await mkdtemp(path.join(tmpdir(), "wh-browser-test-"));
let server;
let serverLogs = "";
let fixture;
let browser;
const database = new Client({ connectionString: process.env.DATABASE_URL });
const errors = [];
try {
  await database.connect();
  const home = await db.household.create({
    data: { name: "Shopping browser fixture" },
  });
  fixture = { householdId: home.id };
  const password = "WickedHome-browser-test-only-2026";
  const passwordHash = await hashPassword(password);
  const people = await Promise.all(
    ["Rob", "Cindy"].map((name) =>
      db.habitant.create({
        data: { householdId: home.id, name, type: "ADULT", color: "#123456" },
      }),
    ),
  );
  const users = await Promise.all(
    people.map((person) =>
      db.user.create({
        data: {
          email: `${person.name.toLowerCase()}-${home.id}@example.test`,
          passwordHash,
          role: "ADULT",
          householdId: home.id,
          habitantId: person.id,
          locale: "nl",
        },
      }),
    ),
  );
  const floor = await db.floor.create({
    data: {
      householdId: home.id,
      name: "Ground floor",
      level: 0,
      kind: "INDOOR",
    },
  });
  const place = await db.place.create({
    data: {
      householdId: home.id,
      floorId: floor.id,
      name: "Pantry",
      kind: "ROOM",
      color: "#123456",
    },
  });
  const shop = await db.shop.create({
    data: { householdId: home.id, name: "Colruyt", type: "SUPERMARKET" },
  });
  const product = await db.product.create({
    data: {
      householdId: home.id,
      name: "Boni Halfvolle Melk 1 l",
      unit: "pak",
      category: "DAIRY",
      isEssential: true,
      defaultShopId: shop.id,
    },
  });
  const initialStock = await db.stockItem.create({
    data: {
      householdId: home.id,
      productId: product.id,
      placeId: place.id,
      quantity: 0,
      minQuantity: 2,
      unit: "pak",
    },
  });
  const spread = await db.product.create({
    data: {
      householdId: home.id,
      name: "BERTOLLI smeerboter met olijfolie 250 g",
      unit: "potje",
      category: "DAIRY",
      packageAmount: 250,
      packageUnit: "g",
    },
  });
  await db.stockItem.create({
    data: {
      householdId: home.id,
      productId: spread.id,
      placeId: place.id,
      quantity: 0,
      minQuantity: 1,
      unit: "potje",
    },
  });
  const account = await db.paymentAccount.create({
    data: {
      householdId: home.id,
      name: "Gezamenlijke rekening",
      kind: "JOINT",
      color: "#123456",
    },
  });

  fixture = {
    householdId: home.id,
    password,
    emails: users.map((user) => user.email),
    stockId: initialStock.id,
    shopId: shop.id,
    productId: product.id,
    spreadId: spread.id,
    accountId: account.id,
    robId: people[0].id,
  };

  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (/^(HOME_ASSISTANT_|ASSISTANT_|GOOGLE_|VAPID_|SMTP_)/.test(key))
      delete environment[key];
  Object.assign(environment, {
    PORT: address.port,
    HOST: address.hostname,
    PUBLIC_URL: base,
    COOKIE_SECURE: "false",
    NODE_ENV: "development",
    STORAGE_DIR: path.join(temporary, "files"),
  });
  server = spawn(process.execPath, ["--import", "tsx", "src/api/server.ts"], {
    cwd: process.cwd(),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Test server did not start: " + serverLogs)),
      30_000,
    );
    const receive = (chunk) => {
      serverLogs += String(chunk);
      if (serverLogs.includes("WickedHome listening on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", receive);
    server.stderr.on("data", receive);
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Test server exited: " + serverLogs));
    });
  });
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((value) => value && existsSync(value));
  browser = await chromium.launch({ headless: true, executablePath });

  const contexts = await Promise.all(
    [0, 1].map(async (index) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const login = await context.request.post(`${base}/api/auth/login`, {
        headers: { "X-WickedHome": "1" },
        data: { email: fixture.emails[index], password: fixture.password },
      });
      assert.equal(login.ok(), true, await login.text());
      return context;
    }),
  );
  const [one, two] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  for (const page of [one, two])
    page.on("pageerror", (error) => errors.push(error.message));
  await one.goto(`${base}/shopping/sessions`);
  await one
    .getByRole("heading", { name: "Winkelsessies", exact: true })
    .waitFor();
  await one
    .locator("input[name=name]")
    .fill("Colruyt — gezamenlijke winkelbeurt");
  await one.getByRole("checkbox", { name: "Colruyt", exact: true }).check();
  await one.getByRole("checkbox", { name: /Boni Halfvolle Melk/ }).check();
  await one.getByRole("button", { name: /Start sessie/ }).click();
  await one.waitForURL(/\/shopping\/sessions\/.+/);
  const sessionUrl = one.url();
  const sessionId = sessionUrl.split("/").at(-1);
  await two.goto(sessionUrl);
  await two.getByRole("button", { name: "Deelnemen", exact: true }).click();
  await one.getByText(/Cindy/).first().waitFor();
  await Promise.all([
    one.getByRole("button", { name: "Gekocht", exact: true }).click(),
    two.getByRole("button", { name: "Gekocht", exact: true }).click(),
  ]);
  await one.locator("details[data-item-status=bought] > summary").click();
  await one.getByText(/Gekocht.*2\/2/).waitFor();
  await two.locator("details[data-item-status=bought] > summary").click();
  await two.getByText(/Gekocht.*2\/2/).waitFor();
  let stock = await database.query(
    "SELECT quantity::text FROM stock_items WHERE id=$1",
    [fixture.stockId],
  );
  assert.equal(stock.rows[0].quantity, "2.000");
  const count = await database.query(
    "SELECT count(*)::int AS n FROM stock_movements WHERE \"householdId\"=$1 AND reason='BOUGHT'",
    [fixture.householdId],
  );
  assert.equal(count.rows[0].n, 1);
  const add = one
    .locator("form")
    .filter({ has: one.locator("select[name=productId]") });
  await add.locator("select[name=productId]").selectOption(fixture.spreadId);
  await add.getByRole("button", { name: "Toevoegen", exact: true }).click();
  const spreadForm = one
    .locator("form")
    .filter({ hasText: "BERTOLLI smeerboter" });
  await spreadForm
    .getByRole("button", { name: "Nu niet", exact: true })
    .click();
  await two.locator("details[data-item-status=skipped] > summary").click();
  await two.getByText(/Nu niet.*0\/1/).waitFor();
  await one
    .getByRole("button", { name: "Sessie afsluiten", exact: true })
    .click();
  await one.getByText("Afgesloten", { exact: true }).waitFor();
  await one
    .locator("summary")
    .filter({ hasText: "Kassabon toevoegen" })
    .click();
  const upload = one
    .locator("form")
    .filter({ has: one.locator("input[name=receipt]") });
  await upload.locator("select[name=shopId]").selectOption(fixture.shopId);
  await upload.locator("input[name=receipt]").setInputFiles({
    name: "colruyt-kassabon.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF"),
  });
  await upload.locator("input[name=total]").fill("5.00");
  await upload
    .getByRole("button", { name: "Kassabon toevoegen", exact: true })
    .click();
  await one
    .getByRole("link", { name: "colruyt-kassabon.pdf", exact: true })
    .waitFor();
  const state = await (
    await contexts[0].request.get(`${base}/api/shopping/sessions/${sessionId}`)
  ).json();
  const milk = state.items.find((item) => item.productId === fixture.productId);
  await one.locator("summary").filter({ hasText: "Bonregel koppelen" }).click();
  const match = one
    .locator("form")
    .filter({ has: one.locator("select[name=itemId]") });
  await match.locator("select[name=itemId]").selectOption(milk.id);
  await match.locator("input[name=reference]").fill("1");
  await match.locator("input[name=quantity]").fill("2");
  await match
    .getByRole("button", { name: "Bonregel koppelen", exact: true })
    .click();
  await match
    .getByRole("button", { name: "Bonregel koppelen", exact: true })
    .click();
  await one
    .locator("summary")
    .filter({ hasText: "Betaling toevoegen of koppelen" })
    .click();
  const payment = one
    .locator("form")
    .filter({ has: one.locator("input[name=amount]") });
  await payment.locator("input[name=payee]").fill("Colruyt");
  await payment.locator("input[name=amount]").fill("5.00");
  await payment
    .locator("select[name=accountId]")
    .selectOption(fixture.accountId);
  await payment.locator("select[name=paidBy]").selectOption(fixture.robId);
  await payment
    .getByRole("button", { name: "Betaling opslaan", exact: true })
    .click();
  await one.getByRole("link", { name: /Colruyt.*5,00/ }).waitFor();
  await payment
    .getByRole("button", { name: "Betaling opslaan", exact: true })
    .click();
  const expenses = await database.query(
    'SELECT count(*)::int AS n FROM bills WHERE "householdId"=$1',
    [fixture.householdId],
  );
  assert.equal(expenses.rows[0].n, 1);
  stock = await database.query(
    "SELECT quantity::text FROM stock_items WHERE id=$1",
    [fixture.stockId],
  );
  assert.equal(stock.rows[0].quantity, "2.000");
  await contexts[1].setOffline(true);
  const newItem = await contexts[0].request.post(
    `${base}/api/shopping/sessions/${sessionId}/items`,
    {
      headers: { "X-WickedHome": "1" },
      data: { name: "Extra na verbindingsherstel", quantity: 1 },
    },
  );
  assert.equal(newItem.status(), 201, await newItem.text());
  await contexts[1].setOffline(false);
  await two
    .getByText("Extra na verbindingsherstel", { exact: false })
    .first()
    .waitFor();
  assert.equal(
    await one.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    "Mobile layout has horizontal overflow",
  );
  await one.screenshot({
    path:
      process.env.SHOPPING_BROWSER_SCREENSHOT ?? "/tmp/wh-shopping-browser.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: two mobile browsers, SSE collaboration, exactly-once buy, skip, close, PDF receipt, receipt replay, payment replay, reconnect and mobile layout.",
  );
} catch (error) {
  const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
  if (pages[0]) {
    await pages[0].screenshot({
      path: "/tmp/wh-shopping-browser-failure.png",
      fullPage: true,
    });
    console.error((await pages[0].locator("body").innerText()).slice(-5000));
  }
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const ended = once(server, "exit");
    server.kill("SIGTERM");
    await ended;
  }
  if (fixture)
    await db.household.delete({ where: { id: fixture.householdId } });
  await db.$disconnect();
  await database.end();
  await rm(temporary, { recursive: true, force: true });
}
