import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createExpense, getRecurringExpenseDetail } from "../src/api/expenses/expenses.service.ts";
import { expenseCreateInputSchema } from "../src/features/expenses/types/expenses.ts";
import { todayIn } from "../src/types/dates.ts";
import { zonedMidnight } from "../src/features/energy/types/energy-time.ts";
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
  await db.place.update({ where: { id: place.id }, data: { polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }] } });
  await db.place.create({ data: { householdId: home.id, floorId: floor.id, name: "Store room", kind: "ROOM", color: "#345678", polygon: [{ x: 400, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 400 }, { x: 400, y: 400 }] } });
  await db.task.create({ data: { householdId: home.id, title: "Check pantry shelves", placeId: place.id } });
  const project = await db.project.create({ data: { householdId: home.id, name: "Pantry refresh", color: "#345678", status: "ACTIVE", places: { create: { placeId: place.id } } } });
  const shop = await db.shop.create({
    data: { householdId: home.id, name: "Colruyt", type: "SUPERMARKET" },
  });
  await db.shop.create({ data: { householdId: home.id, name: "Collect&Go", type: "SUPERMARKET" } });
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
  const variant = await db.product.create({ data: { householdId: home.id, name: "Other linked milk brand", category: "DAIRY", unit: "pak", stockProductId: product.id } });
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
  for (const [name, isEssential] of [
    ["Test essentieel op minimum", true],
    ["Test niet essentieel op minimum", false],
  ]) {
    const thresholdProduct = await db.product.create({
      data: {
        householdId: home.id,
        name,
        unit: "potje",
        category: "DAIRY",
        isEssential,
        defaultShopId: shop.id,
      },
    });
    await db.stockItem.create({
      data: {
        householdId: home.id,
        productId: thresholdProduct.id,
        placeId: place.id,
        quantity: 2,
        minQuantity: 2,
        unit: "potje",
      },
    });
  }
  const account = await db.paymentAccount.create({
    data: {
      householdId: home.id,
      name: "Gezamenlijke rekening",
      kind: "JOINT",
      color: "#123456",
    },
  });

  const recipe = await db.recipe.create({ data: { householdId: home.id, name: "Milk pancakes", ingredients: { create: { name: "Milk", position: 0, productId: product.id, quantity: 1, unit: "pak" } } } });
  const circuit = await db.appliance.create({ data: { householdId: home.id, name: "Kitchen circuit", category: "OTHER", carriers: ["ELECTRICITY"], placeId: place.id } });
  const fridge = await db.appliance.create({ data: { householdId: home.id, name: "Fridge meter", category: "COLD", carriers: ["ELECTRICITY"], placeId: place.id, parentApplianceId: circuit.id } });
  for (const [kind, applianceId, energyWh] of [["GRID_IMPORT", null, 1000], ["APPLIANCE", circuit.id, 500], ["APPLIANCE", fridge.id, 200]]) {
    await db.energyMeter.create({ data: { householdId: home.id, name: applianceId ?? "Grid", carrier: "ELECTRICITY", kind, source: "MANUAL", applianceId,
      intervals: { create: { startAt: zonedMidnight("2026-10-01"), endAt: zonedMidnight("2026-10-02"), energyWh, status: "MEASURED" } } } });
  }
  const contact = await db.contact.create({ data: { householdId: home.id, name: "Long household contractor name", company: "Home repairs", emails: ["repair@example.test"], phones: ["+32 470 12 34 56"], shopId: shop.id, projects: { create: { projectId: project.id, role: "Contractor" } } } });
  const incomeSource = await db.incomeSource.create({ data: { householdId: home.id, habitantId: people[0].id, name: "Historical household salary", kind: "SALARY", rrule: "FREQ=MONTHLY", startDate: new Date("2020-01-01"), amountMode: "FIXED", targetAccountId: account.id, amounts: { create: { effectiveFrom: new Date("2020-01-01"), amountCents: 100000 } } } });
  const incomeReceipt = await db.income.create({ data: { householdId: home.id, habitantId: people[0].id, sourceId: incomeSource.id, kind: "SALARY", periodDate: new Date("2020-01-01"), date: new Date("2020-01-02"), amountCents: 99900, targetAccountId: account.id } });
  const manual = await db.documentFile.create({ data: { householdId: home.id, name: "Product manual.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: crypto.randomUUID(), uploadedAt: new Date(), uploadedById: users[0].id, links: { create: { householdId: home.id, entityType: "product", entityId: product.id } } } });
  const loan = await createExpense(home.id, expenseCreateInputSchema.parse({ payee: "Documented browser loan", amountCents: 23000, totalOpenCents: 100000, dueDate: todayIn(), category: "loans", kind: "loan", rrule: "FREQ=MONTHLY", payerType: "joint", paymentAccountId: account.id }));
  const originalSubscriptionId = `original-${loan.recurringExpenseId}`;
  await db.recurringExpense.update({ where: { id: loan.recurringExpenseId }, data: { legacySubscriptionId: originalSubscriptionId } });
  for (const [name, entityId] of [["Loan agreement.pdf", loan.recurringExpenseId], ["Original loan agreement.pdf", originalSubscriptionId]]) {
    await db.documentFile.create({ data: { householdId: home.id, name, mimeType: "application/pdf", sizeBytes: 10, sha256: crypto.randomUUID(), uploadedAt: new Date(), uploadedById: users[0].id, links: { create: { householdId: home.id, entityType: "subscription", entityId } } } });
  }
  fixture = {
    householdId: home.id,
    projectId: project.id,
    loanId: loan.recurringExpenseId,
    contactId: contact.id,
    incomeSourceId: incomeSource.id,
    incomeReceiptId: incomeReceipt.id,
    manualId: manual.id,
    recipeId: recipe.id,
    circuitId: circuit.id,
    fridgeId: fridge.id,
    password,
    emails: users.map((user) => user.email),
    stockId: initialStock.id,
    shopId: shop.id,
    productId: product.id,
    variantId: variant.id,
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
  // The dashboard previews a whole floor; room selection opens its inspector in the explorer.
  await one.goto(base);
  await one.getByRole("heading", { name: "Ontdek je huis", exact: true }).waitFor();
  assert.equal(await one.getByRole("button", { name: "Volgende ruimte", exact: true }).count(), 0);
  await one.getByRole("button", { name: "Store room", exact: true }).press("Enter");
  await one.waitForURL(/\/house\?.*room=/);
  await one.getByRole("heading", { name: "Store room", exact: true }).waitFor();
  await one.getByRole("button", { name: "Sluiten", exact: true }).click();
  await one.getByRole("button", { name: "Pantry", exact: true }).press("Enter");
  await one.getByRole("link", { name: "Check pantry shelves", exact: true }).waitFor();
  await one.getByRole("link", { name: "Pantry refresh", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/projects/${fixture.projectId}` && url.searchParams.has("from"));
  const related = one.getByRole("navigation", { name: "Gekoppeld aan dit project" });
  await related.waitFor();
  assert.equal(await related.getByRole("link").count(), 6);
  for (const link of await related.getByRole("link").all()) {
    const box = await link.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 76);
  }
  await related.getByRole("link", { name: /^Documenten/ }).click();
  await one.waitForURL(/#project-documents$/);
  assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  // Product sections, shared-stock redirects and shopping preflight retain exact origin context.
  const origin = `/shopping?stock=low&shopId=${fixture.shopId}`;
  await one.goto(`${base}/inventory/products/${fixture.variantId}?workspace=overview&from=${encodeURIComponent(origin)}`);
  await one.waitForURL((url) => url.pathname === `/inventory/products/${fixture.productId}` && url.searchParams.get("variant") === fixture.variantId);
  assert.equal(new URL(one.url()).searchParams.get("from"), origin);
  const productOverview = one.getByRole("tab", { name: "Overzicht", exact: true });
  await productOverview.waitFor();
  assert.equal(await productOverview.getAttribute("aria-selected"), "true");
  const purchasesLink = one.locator(`a[href^="/purchases?productId=${fixture.productId}"]`);
  await purchasesLink.waitFor();
  const productOrigin = new URL(await purchasesLink.getAttribute("href"), base).searchParams.get("from");
  assert.equal(new URL(productOrigin, base).searchParams.get("workspace"), "overview");
  // Related shopping needs have their own purpose-specific record workspace, without
  // creating a second stock/expense record. The full product Overview is the return target.
  const needLink = one.locator('#product-needs a[href^="/shopping/items/"]').first();
  await needLink.waitFor();
  await needLink.click();
  await one.waitForURL((url) => url.pathname.startsWith("/shopping/items/"));
  await one.locator('a[href^="/purchases?requirementId="]').waitFor();
  await one.locator(`a[data-slot="page-back"][href^="/inventory/products/${fixture.productId}"]`).click();
  await productOverview.waitFor();
  assert.equal(await productOverview.getAttribute("aria-selected"), "true");
  await one.getByRole("link", { name: "Milk pancakes", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/recipes/${fixture.recipeId}`);
  await one.getByRole("heading", { name: "Milk pancakes", exact: true }).waitFor();
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await productOverview.waitFor();
  assert.equal(await productOverview.getAttribute("aria-selected"), "true");
  await one.getByRole("tab", { name: "Details", exact: true }).click();
  const beforeNeeds = await database.query('SELECT count(*)::int AS n FROM shopping_items WHERE "householdId"=$1', [fixture.householdId]);
  await one.getByRole("button", { name: "Aan boodschappenlijst toevoegen", exact: true }).click();
  await one.waitForURL((url) => url.pathname === "/shopping" && url.searchParams.get("productId") === fixture.productId);
  const afterNeeds = await database.query('SELECT count(*)::int AS n FROM shopping_items WHERE "householdId"=$1', [fixture.householdId]);
  assert.equal(afterNeeds.rows[0].n, beforeNeeds.rows[0].n, "An existing family need is opened without creating another one");
  // waitForURL only confirms the address: React Router may still be showing the previous
  // product screen while the shopping loader resolves. Never click a stale product Back link.
  await one.getByRole("heading", { name: "Boodschappen", exact: true }).waitFor();
  const returnToProduct = one.locator(`a[data-slot="page-back"][href^="/inventory/products/${fixture.productId}"]`);
  await returnToProduct.waitFor();
  await returnToProduct.click();
  await one.waitForURL((url) => url.pathname === `/inventory/products/${fixture.productId}`);
  assert.equal(new URL(one.url()).searchParams.get("from"), origin);
  assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await one.screenshot({ path: "/tmp/wh-redesign/product-phone.png", fullPage: true });
  // The approved mobile product wireframe shows facts before the two CTA rows.
  const mobileProductStats = await one.locator('main [data-slot="product-statistics"]').boundingBox();
  const mobileProductActions = await one.locator('main [data-slot="product-mobile-actions"]').boundingBox();
  assert.ok(mobileProductStats && mobileProductActions &&
    mobileProductActions.y >= mobileProductStats.y + mobileProductStats.height - 1,
    "Mobile product CTAs appear below product facts, not squeezed beside the title");
  assert.equal(await one.locator('main [data-slot="product-desktop-actions"]').isVisible(), false);
  await one.setViewportSize({ width: 1440, height: 900 });
  const productDesktopActions = one.locator('main [data-slot="product-desktop-actions"]');
  await productDesktopActions.waitFor({ state: "visible" });
  const desktopHeading = await one.locator('main [data-slot="product-hero"] h1').boundingBox();
  const desktopButtons = await productDesktopActions.boundingBox();
  assert.ok(desktopHeading && desktopButtons &&
    desktopButtons.x >= desktopHeading.x + desktopHeading.width - 1,
    "Desktop product actions appear to the right of the title");
  assert.equal(await one.locator('main [data-slot="product-mobile-actions"]').isVisible(), false);
  await one.setViewportSize({ width: 390, height: 844 });

  await one.getByRole("button", { name: "Meer productacties", exact: true }).click();
  await one.getByRole("menuitem", { name: "Voorraadtelling", exact: true }).click();
  await one.waitForURL((url) => url.pathname === "/inventory/count" && url.searchParams.get("productId") === fixture.productId);
  await one.getByRole("button", { name: "Start (1 product)", exact: true }).waitFor();
  await one.getByRole("link", { name: "Stoppen", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/inventory/products/${fixture.productId}`);
  // Energy period flow and inclusion are inspectable in their owner records, including a real form save.
  const energyOrigin = "/energy?period=day&date=2026-10-01";
  await one.goto(`${base}${energyOrigin}`);
  await one.getByText("Energie door je huis", { exact: true }).waitFor();
  await one.getByRole("link", { name: "Kitchen circuit", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/energy/appliances/${fixture.circuitId}`);
  assert.equal(new URL(one.url()).searchParams.get("from"), energyOrigin);
  await one.getByRole("link", { name: "Fridge meter", exact: true }).click();
  await one.getByRole("heading", { name: "Fridge meter", exact: true }).waitFor();
  await one.getByRole("button", { name: "Bewerken", exact: true }).click();
  const applianceEdit = one.getByRole("dialog");
  await applianceEdit.getByRole("combobox", { name: /Inbegrepen in deze metertak/ }).click();
  await one.getByRole("option", { name: "Onafhankelijke tak", exact: true }).click();
  const saveAppliance = one.waitForResponse((response) => new URL(response.url()).pathname === `/api/energy/appliances/${fixture.fridgeId}` && response.request().method() === "PUT");
  await applianceEdit.getByRole("button", { name: "Opslaan", exact: true }).click();
  assert.ok((await saveAppliance).ok());
  await applianceEdit.waitFor({ state: "hidden" });
  assert.equal((await db.appliance.findUniqueOrThrow({ where: { id: fixture.fridgeId } })).parentApplianceId, null);
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.getByRole("heading", { name: "Kitchen circuit", exact: true }).waitFor();
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL((url) => url.pathname === "/energy" && url.searchParams.get("date") === "2026-10-01");
  assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

  // Dedicated record owners retain exact Back chains, recorded relationships and historical IDs.
  await one.goto(`${base}/contacts`);
  await one.getByRole("link", { name: "Long household contractor name", exact: true }).click();
  await one.getByRole("heading", { name: "Long household contractor name", exact: true }).waitFor();
  assert.equal(await one.locator('a[href^="tel:"]').count(), 1);
  await one.getByRole("link", { name: "Pantry refresh", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/projects/${fixture.projectId}`);
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/contacts/${fixture.contactId}`);
  await one.getByRole("heading", { name: "Long household contractor name", exact: true }).waitFor();
  await one.getByRole("button", { name: "Long household contractor name bewerken", exact: true }).click();
  await one.getByRole("dialog").waitFor();
  const contactEdit = one.getByRole("dialog");
  await contactEdit.getByRole("textbox", { name: /^Bedrijf/ }).fill("Updated home repairs");
  await contactEdit.getByRole("button", { name: "Opslaan", exact: true }).click();
  await contactEdit.waitFor({ state: "hidden" });
  await one.getByText("Updated home repairs", { exact: true }).first().waitFor();
  assert.equal((await db.contact.findUniqueOrThrow({ where: { id: fixture.contactId } })).company, "Updated home repairs");

  const sourceOrigin = `/income/sources/${fixture.incomeSourceId}?month=2020-01`;
  await one.goto(`${base}${sourceOrigin}`);
  await one.getByRole("heading", { name: "Historical household salary", exact: true }).waitFor();
  await one.locator(`a[href^="/income/receipts/${fixture.incomeReceiptId}"]`).first().click();
  await one.waitForURL((url) => url.pathname === `/income/receipts/${fixture.incomeReceiptId}`);
  await one.getByRole("heading", { name: "Historical household salary", exact: true }).waitFor();
  assert.equal(new URL(one.url()).pathname, `/income/receipts/${fixture.incomeReceiptId}`);
  await one.getByRole("link", { name: "Gezamenlijke rekening", exact: true }).click();
  await one.waitForURL((url) => url.pathname === "/money" && url.searchParams.get("month") === "2020-01");
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/income/receipts/${fixture.incomeReceiptId}`);
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/income/sources/${fixture.incomeSourceId}` && url.searchParams.get("month") === "2020-01");

  await one.goto(`${base}/inventory/products/${fixture.productId}?workspace=overview`);
  await one.getByRole("link", { name: "Product manual.pdf", exact: true }).click();
  await one.getByRole("heading", { name: "Product manual.pdf", exact: true }).waitFor();
  assert.equal(new URL(one.url()).pathname, `/documents/files/${fixture.manualId}`);
  await one.getByRole("link", { name: "Boni Halfvolle Melk 1 l", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/inventory/products/${fixture.productId}`);
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.getByRole("heading", { name: "Product manual.pdf", exact: true }).waitFor();
  assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

  await one.goto(`${base}/habitants/${fixture.robId}`);
  await one.getByRole("heading", { name: "Rob", exact: true }).waitFor();
  await one.getByRole("heading", { name: "Toegewezen taken", exact: true }).waitFor();

  // Recurring documents remain readable under their original identity; loan actions use the actual owner forms.
  const loanPath = `/expenses/recurring/${fixture.loanId}`;
  await one.goto(`${base}${loanPath}`);
  await one.getByRole("heading", { name: "Documented browser loan", exact: true }).waitFor();
  await one.getByRole("link", { name: "Loan agreement.pdf", exact: true }).waitFor();
  await one.getByRole("link", { name: "Original loan agreement.pdf", exact: true }).click();
  await one.waitForURL((url) => url.pathname.startsWith("/documents/files/"));
  await one.getByRole("heading", { name: "Original loan agreement.pdf", exact: true }).waitFor();
  assert.equal(new URL(one.url()).searchParams.get("from"), loanPath);
  await one.getByRole("link", { name: "Documented browser loan", exact: true }).waitFor();
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL((url) => url.pathname === loanPath);
  await one.getByRole("heading", { name: "Documented browser loan", exact: true }).waitFor();
  for (const full of [false, true]) {
    await one.getByRole("button", { name: "Terugbetaling boeken", exact: true }).click();
    const repayment = one.getByRole("dialog");
    await repayment.getByRole("heading", { name: "Uitgave noteren", exact: true }).waitFor();
    if (full) await repayment.getByRole("button", { name: "Resterend saldo afbetalen", exact: true }).click();
    else await repayment.getByRole("textbox", { name: /^Bedrag/ }).fill("200,00");
    const savedRepayment = one.waitForResponse((response) => new URL(response.url()).pathname === "/api/expenses" && response.request().method() === "POST");
    await repayment.getByRole("button", { name: "Opslaan", exact: true }).click();
    assert.ok((await savedRepayment).ok());
    await repayment.waitFor({ state: "hidden" });
    const expected = full ? 0 : 80000;
    assert.equal((await getRecurringExpenseDetail(fixture.householdId, fixture.loanId)).recurring.totalOpen.remainingCents, expected);
    // The next click uses the refreshed balance, not the previous render's loan prop.
    if (!full) await one.getByRole("progressbar", { name: /20/ }).waitFor();
  }
  await one.getByRole("button", { name: "Terugbetaling boeken", exact: true }).waitFor({ state: "hidden" });
  const payoff = await db.expense.findFirstOrThrow({ where: { householdId: fixture.householdId, earlyRepaymentForId: fixture.loanId, amountCents: 80000 } });
  await one.getByRole("tab", { name: "Betalingen en historiek", exact: true }).click();
  await one.locator(`a[href^="/expenses/${payoff.id}"]`).click();
  await one.waitForURL((url) => url.pathname === `/expenses/${payoff.id}`);
  await one.getByRole("heading", { name: "Documented browser loan", exact: true }).waitFor();
  const undone = one.waitForResponse((response) => new URL(response.url()).pathname === `/api/expenses/${payoff.id}/payment` && response.request().method() === "DELETE");
  await one.getByRole("button", { name: "Markeer als onbetaald", exact: true }).click();
  assert.ok((await undone).ok());
  await one.getByRole("button", { name: "Markeer als betaald", exact: true }).click();
  const repay = one.getByRole("dialog");
  const paidAgain = one.waitForResponse((response) => new URL(response.url()).pathname === `/api/expenses/${payoff.id}/payment` && response.request().method() === "PUT");
  await repay.getByRole("button", { name: "Markeer als betaald", exact: true }).click();
  assert.ok((await paidAgain).ok());
  await repay.waitFor({ state: "hidden" });
  assert.equal((await getRecurringExpenseDetail(fixture.householdId, fixture.loanId)).recurring.totalOpen.remainingCents, 0);
  assert.equal(await db.expense.count({ where: { householdId: fixture.householdId, earlyRepaymentForId: fixture.loanId, paidOn: { not: null } } }), 2);

  // Verify the same forecast and visible toggles in ordinary groceries, shop view and visit selection.
  for (const screen of [
    "/shopping",
    `/shopping/shops/${fixture.shopId}`,
    "/shopping/sessions",
  ]) {
    await one.goto(`${base}${screen}`);
    if (screen === "/shopping/sessions") await one.locator("summary").filter({ hasText: "Specifieke boodschappen en andere opties kiezen" }).click();
    const essential = one.getByText(/^Test essentieel op minimum(?:\s|$)/);
    const optional = one.getByText(/^Test niet essentieel op minimum(?:\s|$)/);
    await essential.first().waitFor();
    await optional.first().waitFor();
    assert.ok(
      await one
        .locator('[data-stock-need="out"]')
        .filter({ has: essential })
        .count(),
    );
    assert.ok(
      await one
        .locator('[data-stock-need="nearly_out"]')
        .filter({ has: optional })
        .count(),
    );
    // The shopping overview keeps stock filters inside its single compact toolbar.
    // Shop view and advanced session planning still expose their own stock buttons.
    if (screen === "/shopping") {
      await one.getByRole("button", { name: "Weergave en filters", exact: true }).click();
      const chooseStock = async (label) => {
        await one.getByRole("combobox", { name: "Voorraadfilter" }).click();
        await one.getByRole("option", { name: label, exact: true }).click();
      };
      await chooseStock("Op");
      await optional.first().waitFor({ state: "hidden" });
      await essential.first().waitFor();
      await chooseStock("Alles");
      await optional.first().waitFor();
      await chooseStock("Bijna op");
      await essential.first().waitFor({ state: "hidden" });
      await optional.first().waitFor();
      await chooseStock("Alles");
      await essential.first().waitFor();
      await one.keyboard.press("Escape");
    } else {
      await one.getByRole("button", { name: "Op", exact: true }).click();
      await optional.first().waitFor({ state: "hidden" });
      await essential.first().waitFor();
      await one.getByRole("button", { name: "Op", exact: true }).click();
      await optional.first().waitFor();
      await one.getByRole("button", { name: "Bijna op", exact: true }).click();
      await essential.first().waitFor({ state: "hidden" });
      await optional.first().waitFor();
      await one.getByRole("button", { name: "Alles", exact: true }).click();
      await essential.first().waitFor();
    }
    assert.equal(
      await one.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      screen + " should fit mobile width",
    );
    if (screen === "/shopping")
      await one.screenshot({
        path: "/tmp/wh-shopping-need.png",
        fullPage: true,
      });
  }
  await one.goto(`${base}/shopping/sessions`);
  await one
    .getByRole("heading", { name: "Winkelsessies", exact: true })
    .waitFor();
  await one.locator("summary").filter({ hasText: "Specifieke boodschappen en andere opties kiezen" }).click();
  await one.getByRole("combobox", { name: "Winkel of opgeslagen groep", exact: true }).click();
  await one.getByRole("option", { name: /Colruyt/ }).click();
  await one
    .locator("input[name=name]")
    .fill("Colruyt — gezamenlijke winkelbeurt");
  await one.getByRole("checkbox", { name: /Boni Halfvolle Melk/ }).check();
  await one.getByRole("button", { name: /Start sessie/ }).click();
  await one.waitForURL(/\/shopping\/sessions\/.+/);
  const sessionUrl = one.url();
  const sessionId = sessionUrl.split("/").at(-1);
  // Adjust is an overlay, not a navigation or a purchase. Select only already-linked variants.
  const edit = async (quantity, variant) => {
    await one.getByRole("button", { name: "Aanpassen", exact: true }).click();
    const dialog = one.getByRole("dialog").filter({ has: one.locator("input[name=quantity]") });
    await dialog.locator("input[name=quantity]").fill(String(quantity));
    await dialog.getByRole("combobox").click();
    await one.getByRole("option", { name: new RegExp(variant) }).click();
    await dialog.getByRole("button", { name: "Hoeveelheid bewaren", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(one.url(), sessionUrl);
    const stock = await database.query("SELECT quantity::text FROM stock_items WHERE id=$1", [fixture.stockId]);
    assert.equal(stock.rows[0].quantity, "0.000", "Adjust never buys goods");
  };
  await edit(3, "Other linked milk brand");
  await edit(2, "Boni Halfvolle Melk");
  await two.goto(sessionUrl);
  await two.getByRole("button", { name: "Deelnemen", exact: true }).click();
  await one.getByText(/Cindy/).first().waitFor();
  // Another household member changes the row while Adjust is open: keep the draft and explain the conflict.
  await one.getByRole("button", { name: "Aanpassen", exact: true }).click();
  const staleDialog = one.getByRole("dialog").filter({ has: one.locator("input[name=quantity]") });
  await staleDialog.locator("input[name=quantity]").fill("3");
  const latest = await (await contexts[1].request.get(`${base}/api/shopping/sessions/${sessionId}`)).json();
  const changed = await contexts[1].request.patch(`${base}/api/shopping/sessions/${sessionId}/items/${latest.items[0].id}`, {
    headers: { "X-WickedHome": "1" }, data: { revision: latest.items[0].revision, operationId: "other-person-while-editing", quantity: 2 },
  });
  assert.ok(changed.ok(), await changed.text());
  await staleDialog.getByRole("button", { name: "Hoeveelheid bewaren", exact: true }).click();
  await staleDialog.getByText(/Iemand heeft dit product gewijzigd/).waitFor();
  assert.equal(await staleDialog.locator("input[name=quantity]").inputValue(), "3");
  assert.equal(one.url(), sessionUrl);
  await staleDialog.getByRole("button", { name: "Annuleren", exact: true }).click();
  await staleDialog.waitFor({ state: "hidden" });
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
  await one.getByRole("button", { name: "Toevoegen", exact: true }).click();
  const extra = one.getByRole("dialog", { name: "Toevoegen", exact: true });
  await extra.getByRole("combobox").click();
  await one.getByRole("option", { name: /BERTOLLI smeerboter/ }).click();
  await one.locator('[data-slot="sheet-content"]').waitFor({ state: "hidden" });
  await extra.getByRole("button", { name: "Opslaan", exact: true }).click();
  await extra.waitFor({ state: "hidden" });
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
  await one.getByRole("button", { name: "Betaling toevoegen of koppelen", exact: true }).click();
  const payment = one.getByRole("dialog");
  await payment.locator("input[name=payee]").fill("Colruyt");
  await payment.getByLabel("Betaald bedrag (€)", { exact: true }).fill("5,00");
  await payment.getByLabel(/^Betaalrekening/ ).click();
  await one.getByRole("option", { name: "Gezamenlijke rekening", exact: true }).click();
  await payment.getByLabel(/^Betaald door/ ).click();
  await one.getByRole("option", { name: "Rob", exact: true }).click();
  const paymentRequest = one.waitForRequest((request) => request.url().endsWith(`/sessions/${sessionId}/payments`) && request.method() === "POST");
  await payment.getByRole("button", { name: "Betaling opslaan", exact: true }).click();
  const originalPayment = (await paymentRequest).postDataJSON();
  await payment.waitFor({ state: "hidden" });
  await one.getByRole("link", { name: /Colruyt.*5,00/ }).waitFor();
  const replay = await contexts[0].request.post(`${base}/api/shopping/sessions/${sessionId}/payments`, { headers: { "X-WickedHome": "1" }, data: originalPayment });
  assert.ok(replay.ok(), await replay.text());
  const expenses = await database.query(
    'SELECT count(DISTINCT b.id)::int AS n FROM bills b JOIN shopping_payments p ON p."expenseId"=b.id JOIN shopping_purchases sp ON sp.id=p."purchaseId" WHERE b."householdId"=$1 AND sp."sessionId"=$2',
    [fixture.householdId, sessionId],
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
  await two.getByText("Extra na verbindingsherstel", { exact: false }).filter({ visible: true }).first().waitFor();
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
  // Saved groups belong to Shops and feed the ordinary, single-choice session start.
  await one.goto(`${base}/shops`);
  await one.getByRole("button", { name: "Groep maken", exact: true }).click();
  const groupDialog = one.getByRole("dialog");
  await groupDialog.locator("input[name=name]").fill("Weekly run");
  await groupDialog.locator("button[role=combobox]").click();
  await one.getByRole("option", { name: "Colruyt", exact: true }).click();
  await groupDialog.locator("button[role=combobox]").click();
  await one.getByRole("option", { name: "Collect&Go", exact: true }).click();
  await groupDialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await groupDialog.waitFor({ state: "hidden" });
  await one.getByRole("link", { name: /^Weekly run/ }).click();
  await one.getByRole("heading", { name: "Winkelsessies", exact: true }).waitFor();
  assert.equal(await one.locator("input[name=name]").isVisible(), false, "Ordinary start needs no administrative name");
  assert.equal(await one.getByRole("checkbox").filter({ visible: true }).count(), 0, "Ordinary destination selection has no checkbox matrix");
  await one.getByRole("button", { name: "Start winkelen", exact: true }).click();
  await one.waitForURL(/\/shopping\/sessions\/[^?]+$/);
  const started = await (await contexts[0].request.get(`${base}/api/shopping/sessions/${one.url().split("/").at(-1)}`)).json();
  assert.equal(started.shopIds.length, 2); assert.ok(started.items.length > 0, "Current matching needs become the checklist");

  // Deliberate goods purpose and cost shares stay separate from stock and account effects.
  const paidVisit = await (await contexts[0].request.get(`${base}/api/shopping/sessions/${sessionId}`)).json();
  const purchased = paidVisit.purchases[0]; const acquisitionId = purchased.lines[0].id; const expenseId = purchased.payments[0].expenseId;
  await one.goto(`${base}/purchases/${purchased.id}`);
  await one.getByRole("button", { name: "Doel toewijzen", exact: true }).click();
  const goodsDialog = one.getByRole("dialog");
  await goodsDialog.locator("input[name=householdQuantity]").fill("1");
  await goodsDialog.getByRole("button", { name: "Project toevoegen", exact: true }).click();
  await goodsDialog.getByLabel("Aantal voor dit project", { exact: true }).fill("1");
  await goodsDialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await goodsDialog.waitFor({ state: "hidden" });
  const assigned = await (await contexts[0].request.get(`${base}/api/purchases/goods/${acquisitionId}/allocation`)).json();
  assert.equal(assigned.householdQuantity, 1); assert.equal(assigned.projects[0].quantity, 1); assert.equal(assigned.unallocatedQuantity, 0);
  await one.getByRole("link", { name: "Colruyt", exact: true }).click();
  await one.waitForURL((url) => url.pathname === `/expenses/${expenseId}` && url.searchParams.has("from"));
  const expenseOwnerUrl = one.url();
  await one.getByRole("link", { name: "Gezamenlijke rekening", exact: true }).click();
  await one.waitForURL((url) => url.pathname === "/money" && url.searchParams.get("account") === fixture.accountId && url.searchParams.get("tab") === "history");
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL(expenseOwnerUrl);
  await one.getByRole("button", { name: "Kosten verdelen", exact: true }).click();
  const costsDialog = one.getByRole("dialog");
  await costsDialog.getByLabel("Huishouden", { exact: true }).fill("1,00");
  await costsDialog.getByRole("button", { name: "Project toevoegen", exact: true }).click();
  await costsDialog.getByLabel("Projectbedrag", { exact: true }).fill("4,00");
  await costsDialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await costsDialog.waitFor({ state: "hidden" });
  const costView = await (await contexts[0].request.get(`${base}/api/expenses/${expenseId}/allocations`)).json();
  assert.equal(costView.householdCents, 100); assert.equal(costView.projects[0].amountCents, 400);
  await one.getByRole("button", { name: "Kosten verdelen", exact: true }).click();
  await costsDialog.getByLabel("Projectbedrag", { exact: true }).waitFor();
  const concurrent = await contexts[1].request.put(`${base}/api/expenses/${expenseId}/allocations`, { headers: { "X-WickedHome": "1" }, data: { revision: costView.revision, householdCents: 150, projects: [{ projectId: fixture.projectId, amountCents: 350 }] } });
  assert.ok(concurrent.ok(), await concurrent.text());
  await costsDialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  await costsDialog.getByText(/Je invoer blijft bewaard/).waitFor();
  assert.equal(await costsDialog.getByLabel("Projectbedrag", { exact: true }).inputValue(), "4,00");
  await costsDialog.getByRole("button", { name: "Annuleren", exact: true }).click();
  await one.getByRole("link", { name: "Terug naar waar je vandaan kwam", exact: true }).click();
  await one.waitForURL(new RegExp(`/purchases/${purchased.id}$`));
  assert.equal((await database.query('SELECT count(DISTINCT b.id)::int AS n FROM bills b JOIN shopping_payments p ON p."expenseId"=b.id JOIN shopping_purchases sp ON sp.id=p."purchaseId" WHERE b."householdId"=$1 AND sp."sessionId"=$2', [fixture.householdId, sessionId])).rows[0].n, 1);
  assert.equal((await database.query('SELECT quantity::text FROM stock_items WHERE id=$1', [fixture.stockId])).rows[0].quantity, "2.000");

  // The shared PageHeader preserves title and actions first; supporting copy disappears
  // on phones and on desktop widths where two actions compete with the title.
  for (const width of [320, 390, 768, 1440, 1600]) {
    await one.setViewportSize({ width, height: 900 });
    await one.goto(`${base}/shopping`);
    const pageHeader = one.locator('main [data-slot="page-heading-layout"]').first();
    await pageHeader.waitFor({ state: "attached" });
    const geometry = await pageHeader.evaluate((layout) => {
      const heading = layout.querySelector('[data-slot="page-heading"]');
      const actions = layout.querySelector('[data-slot="page-header-actions"]');
      const description = heading?.querySelector('[data-slot="page-description"]');
      const buttons = Array.from(actions?.querySelectorAll('button[data-slot="button"]') ?? []);
      const start = buttons.find((button) => button.textContent?.includes("Start winkelen"));
      const add = buttons.find((button) => button.textContent?.includes("Boodschap toevoegen"));
      const rect = (node) => node?.getBoundingClientRect();
      return { heading: rect(heading)?.toJSON(), actions: rect(actions)?.toJSON(),
        descriptionVisible: Boolean(description && getComputedStyle(description).display !== "none"),
        start: rect(start)?.toJSON(), add: rect(add)?.toJSON() };
    });
    assert.ok(geometry.heading && geometry.actions && geometry.start && geometry.add, `Shopping header has both visible CTAs at ${width}px`);
    if (width < 1280) {
      assert.ok(geometry.actions.top >= geometry.heading.bottom - 1, `Shopping actions sit below the complete heading at ${width}px`);
      if (width < 640) assert.ok(geometry.add.top >= geometry.start.bottom - 1,
        `Shopping CTAs stack on separate phone rows at ${width}px`);
    } else {
      assert.ok(geometry.actions.left >= geometry.heading.right - 1, `Shopping desktop CTAs sit right of title at ${width}px`);
    }
    assert.equal(geometry.descriptionVisible, width >= 1536,
      `Non-essential shopping description is hidden until sufficiently wide desktops at ${width}px`);
    assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
      `Shopping header must not cause overflow at ${width}px`);
  }

  // Every top-level module keeps a working entry point under the shared shell.
  const modulePaths = ["/", "/tasks", "/projects", "/shopping", "/inventory", "/recipes", "/calendar", "/purchases", "/expenses", "/income", "/money", "/house", "/places", "/devices", "/energy", "/habitants", "/shopping/products", "/shops", "/documents", "/contacts", "/assistant", "/home-assistant", "/integrations", "/notifications", "/settings", "/devices/profiles", "/energy/appliances", "/energy/setup", "/energy/import", "/documents/trash"];
  for (const [locale, theme, width] of [["en", "light", 390], ["nl", "dark", 1440]]) {
    await db.user.updateMany({ where: { householdId: fixture.householdId }, data: { locale } });
    await one.evaluate(({ locale, theme }) => { localStorage.setItem("wh-locale", locale); localStorage.setItem("wh-theme", theme); }, { locale, theme });
    await one.setViewportSize({ width, height: 1000 });
    for (const modulePath of modulePaths) {
      console.log("Module check:", modulePath, locale, theme);
      await one.goto(`${base}${modulePath}`);
      await one.locator("main h1").first().waitFor();
      await one.locator("main [role=alert]").first().isVisible().then((visible) => { if (visible) console.log("Visible module notice:", modulePath); });
      assert.equal(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${modulePath} ${locale}/${theme} fits ${width}px`);
      assert.equal(await one.getByText(/Unexpected Application Error|Something went wrong/i).count(), 0, `${modulePath} has no route error`);
      if (width >= 1024) assert.equal(await one.locator("aside nav a[aria-current=page]").count(), 1, `${modulePath} has one active sidebar destination`);
      assert.ok((await one.locator("main h1").first().innerText()).trim(), `${modulePath} has a page identity`);
      // Every shared header must keep its title readable instead of giving its width to actions.
      const brokenHeaders = await one.locator('main [data-slot="page-heading-layout"]').evaluateAll((layouts) =>
        layouts.flatMap((layout) => {
          const heading = layout.querySelector('[data-slot="page-heading"]');
          const actions = layout.querySelector('[data-slot="page-header-actions"]');
          if (!heading || !actions) return [];
          const h = heading.getBoundingClientRect();
          const a = actions.getBoundingClientRect();
          if (!h.width || !a.width) return [];
          const mobile = window.innerWidth < 1280;
          const valid = mobile ? a.top >= h.bottom - 1 : a.left >= h.right - 1;
          return valid ? [] : [{ heading: h.toJSON(), actions: a.toJSON() }];
        }));
      assert.deepEqual(brokenHeaders, [], `${modulePath} has responsive title/actions layout at ${width}px`);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: floor map and room inspector, project summary cards, quantity/variant Adjust without navigation or stock, retained drafts on concurrent edit conflicts, Op/Bijna op dividers and toggles across three shopping views, two mobile browsers, SSE collaboration, exactly-once buy, skip, close, PDF receipt, receipt/payment replay, saved-group automatic start, goods/cost allocation with conflict drafts, return context, 60 module/language/theme entry checks and mobile layout.",
  );
} catch (error) {
  const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
  if (pages[0]) {
    await pages[0].screenshot({
      path: "/tmp/wh-shopping-browser-failure.png",
      fullPage: true,
    });
    console.error("Failing page:", pages[0].url());
    console.error((await pages[0].locator("body").innerText()).slice(-5000));
    console.error("Heading visibility:", JSON.stringify(await pages[0].locator("h1").evaluateAll((headings) =>
      headings.map((heading) => {
        const ancestors = [];
        let node = heading;
        while (node && ancestors.length < 8) {
          const style = getComputedStyle(node);
          ancestors.push({ tag: node.tagName, id: node.id, className: node.className?.toString().slice(0, 120),
            display: style.display, visibility: style.visibility, ariaHidden: node.getAttribute("aria-hidden"),
            inert: node.inert, rect: [node.getBoundingClientRect().width, node.getBoundingClientRect().height] });
          node = node.parentElement;
        }
        return { text: heading.textContent, ancestors };
      })
    )));

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
