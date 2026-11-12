import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const directory = path.resolve("dist/storybook");
const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
const names = /\/(?:ShoppingItemScreen|EnergyMeterScreen|EnergySourceScreen|DocumentDetailScreen|HabitantDetailScreen|ContactDetailScreen|IncomeSourceScreen|IncomeRecordScreen|AppShell|ExpenseAccountPanel|RecurringPaymentsScreen|EnergyNetwork|EnergyMeterTree|ApplianceDetailScreen|EnergyOverviewScreen|PlaceAppliancesSection|RecordWorkspaceTabs|SplitAction|ProductStockScreen|RecurringExpenseDetailScreen|HomeRoomMap|EntityMultiPicker|ImageChoiceGrid|RecordImage|RecordLink|RecordOrigin|RecordProgress|RelatedRecordCards|SectionNavigation|ShoppingNavigation|IncomeScreen|SettingsScreen|MoneyFlowScreen|DeviceFormField|DeviceTasksPanel|GoodsAllocationDialog|PurchaseDetailScreen|PurchasesScreen|ProductContextPanels|PlaceDevicesSection|PlaceProjectsSection|LinkedImagePicker|ExpenseAllocationPanel|HaDeviceControlPanel|HaScenesPanel|PurchasePaymentsPanel|SessionPayments|SessionStartCard|SessionExtraDialog|SessionsScreen|ShopDestinationPicker|ShopGroupFormDialog|SessionItemAdjustDialog)$/;
const examples = new Set(["WithDocuments", "ReadOnlyDocuments", "Default", "Bought", "Imported", "Battery", "Pending", "Deleted", "Pet", "Supplier", "Historical", "Voucher", "Variable", "Unpaid", "OutsideHistory", "Gas", "Total", "Excess", "Independent", "GasMonth", "TotalYear", "SolarNotMeasured", "WithOrigin", "Action", "Management", "Busy", "Disabled", "CoffeeInTwoPlaces", "AsChild", "NotKeptYet", "SharedStock", "MixedUnits", "LowStock", "BrokenImage", "DownPayment", "LoanWithTotalOpen", "DownPaymentWithTotalOpen", "Paused", "Ended", "ReadOnly", "Payments", "StatusRejected", "ThisMonth", "Expected", "Received", "Sources", "Household", "LegacyWasteLink", "SectionFailed", "Start", "Checklist", "Child", "ActiveAndPreviousCards", "ActiveAndPreviousCardsPhone", "GroupChecklist", "GroupChecklistPhone", "ClosedChecklist", "Empty", "Offline", "NoCapabilities", "Missing", "Failed", "Complete", "Loading", "NestedDestination", "PersistentPhoneNavigation"]);
const stories = Object.values(index.entries).filter((entry) => entry.type === "story" && names.test(entry.title) && examples.has(entry.exportName));
assert.ok(stories.length >= 25, "Build the complete component catalogue first");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(directory, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return; }
  try { const content = await readFile(file); response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }); response.end(content); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((value) => value && existsSync(value));
let browser;
const failures = []; const errors = []; const apiRequests = []; let checked = 0;
const accessibility = [];
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  if (!process.env.REDESIGN_INTERACTIONS_ONLY) for (const locale of ["en", "nl"]) for (const theme of ["light", "dark"]) for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const story of stories) {
      await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale};theme:${theme}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
      await page.evaluate(() => document.fonts.ready);
      const problem = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, storyError: [...document.querySelectorAll(".sb-errordisplay")].some((element) => element.getClientRects().length > 0) }));
      if (problem.overflow || problem.storyError) failures.push({ id: story.id, locale, theme, width, ...problem });
      if (story.exportName === "NestedDestination" && width >= 1024) assert.equal(await page.locator("aside nav a[aria-current=page]").count(), 1);
      checked++;
    }
    console.log(`Rendered ${locale}/${theme}/${width}: ${stories.length} examples`);
  }
  // Exercise owner navigation rather than treating a successful render as workflow acceptance.
  const openStory = async (title, exportName) => {
    const story = Object.values(index.entries).find((entry) => entry.title === title && entry.exportName === exportName);
    assert.ok(story, `${title}/${exportName}`);
    await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=locale:en;theme:light`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
  };
  await page.setViewportSize({ width: 390, height: 900 });
  await openStory("Features/Shopping/Screens/SessionsScreen", "ActiveAndPreviousCards");
  assert.equal(await page.getByRole("link", { name: /Open shopping visit/i }).count(), 2, "Active and past sessions are full-card links");
  await page.getByRole("heading", { name: "Active visits", exact: true }).waitFor();
  await openStory("Features/Shopping/Screens/SessionsScreen", "GroupChecklist");
  assert.equal(await page.locator('[data-slot="page-back"]').count(), 1, "Exactly one context-aware Back control");
  await page.getByRole("tab", { name: "Shopping checklist", exact: true }).waitFor();
  await page.getByRole("button", { name: "Bought", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Purchases and receipts", exact: true }).click();
  await page.getByText("No purchases linked to this visit yet.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Shopping checklist", exact: true }).click();
  await openStory("Shared/RecordWorkspaceTabs", "WithOrigin");
  const overview = page.getByRole("tab", { name: "Overview", exact: true });
  await overview.click();
  await page.getByRole("heading", { name: "Connected records", exact: true }).waitFor();
  assert.equal(await overview.getAttribute("aria-selected"), "true");
  const taskLink = new URL(await page.getByRole("link", { name: "Related task", exact: true }).getAttribute("href"), base);
  const tabOrigin = new URL(taskLink.searchParams.get("from"), base);
  assert.equal(tabOrigin.searchParams.get("stock"), "low");
  assert.equal(tabOrigin.searchParams.get("from"), "/shopping?shopId=local");
  assert.equal(tabOrigin.searchParams.get("workspace"), "overview");
  await page.getByRole("tab", { name: "Details", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.activeElement?.textContent === "Overview");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Connected records", exact: true }).waitFor();
  assert.equal(await overview.getAttribute("aria-selected"), "true");

  await openStory("Shared/SplitAction", "Action");
  const menuTrigger = page.getByRole("button", { name: "More product actions", exact: true });
  await menuTrigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Adjust stock", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await menuTrigger.evaluate((element) => element === document.activeElement), true);
  await openStory("Shared/SplitAction", "Disabled");
  assert.equal(await page.getByRole("button", { name: "Add to shopping list", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "More product actions", exact: true }).isDisabled(), true);

  await openStory("Features/Inventory/Screens/ProductStockScreen", "AsChild");
  assert.equal(await page.locator('[data-slot="page-back"]').count(), 1);
  assert.equal(await page.getByRole("button", { name: "Edit product", exact: true }).count(), 0);
  await page.getByRole("button", { name: "More product actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Scan", exact: true }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Adjust stock", exact: true }).count(), 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Advanced stock management/ }).click();
  assert.equal(await page.getByRole("button", { name: /^Use one / }).count(), 2);
  assert.equal(await page.getByRole("button", { name: /^Add one / }).count(), 2);
  await openStory("Features/Inventory/Screens/ProductStockScreen", "MixedUnits");
  await page.getByText("Mixed units", { exact: true }).first().waitFor();
  await openStory("Features/Inventory/Screens/ProductStockScreen", "NotKeptYet");
  // Secondary header copy is intentionally hidden at this phone width; verify its value and the visible statistic.
  await page.getByText("Not tracked yet", { exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.getByText("—", { exact: true }).count(), 1, "An untracked product has no recorded zero count");
  await openStory("Features/Inventory/Screens/ProductStockScreen", "BrokenImage");
  await page.waitForFunction(() => !document.querySelector('img[src="/missing-product-image.png"]'));

  await openStory("Features/Expenses/Screens/RecurringExpenseDetailScreen", "Payments");
  const paymentsTab = page.getByRole("tab", { name: "Payments & history", exact: true });
  await paymentsTab.waitFor();
  assert.equal(await paymentsTab.getAttribute("aria-selected"), "true");
  const payment = page.getByRole("tabpanel").locator('a[href^="/expenses/"]').first();
  const paymentUrl = new URL(await payment.getAttribute("href"), base);
  const origin = new URL(paymentUrl.searchParams.get("from"), base);
  assert.equal(origin.searchParams.get("workspace"), "overview");
  assert.equal(origin.searchParams.get("from"), "/expenses?view=recurring&kind=loan");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Edit schedule", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await openStory("Features/Expenses/Screens/RecurringExpenseDetailScreen", "StatusRejected");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByText("This schedule changed. Please refresh.", { exact: true }).waitFor();
  assert.equal(await page.getByText("Paused: no new expenses until you resume it", { exact: true }).count(), 0);
  await openStory("Features/Expenses/Screens/RecurringExpenseDetailScreen", "ReadOnly");
  assert.equal(await page.getByRole("button", { name: "Edit schedule", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Pause", exact: true }).count(), 0);

  for (const [title, example] of [
    ["Features/Inventory/Screens/ProductStockScreen", "CoffeeInTwoPlaces"],
    ["Features/Inventory/Screens/ProductStockScreen", "AsChild"],
    ["Features/Expenses/Screens/RecurringExpenseDetailScreen", "LoanWithTotalOpen"],
    ["Features/Expenses/Screens/RecurringExpenseDetailScreen", "DownPayment"],
    ["Features/Expenses/Screens/RecurringExpenseDetailScreen", "Payments"],
    ["Features/Expenses/Screens/RecurringExpenseDetailScreen", "WithDocuments"],
    ["Features/Expenses/Screens/RecurringExpenseDetailScreen", "ReadOnlyDocuments"],
    ["Features/Expenses/Screens/RecurringPaymentsScreen", "Default"],
    ["Features/Money/Components/ExpenseAccountPanel", "Default"],
    ["Features/Energy/Components/EnergyNetwork", "Default"],
    ["Features/Energy/Components/EnergyMeterTree", "Default"],
    ["Features/Energy/Components/EnergyMeterTree", "Excess"],
    ["Features/Energy/Screens/ApplianceDetailScreen", "Default"],
    ["Features/Energy/Screens/ApplianceDetailScreen", "Child"],
    ["Features/Contacts/Screens/ContactDetailScreen", "Default"],
    ["Features/Contacts/Screens/ContactDetailScreen", "Child"],
    ["Features/Income/Screens/IncomeSourceScreen", "Default"],
    ["Features/Income/Screens/IncomeSourceScreen", "Child"],
    ["Features/Income/Screens/IncomeRecordScreen", "Default"],
    ["Features/Documents/Screens/DocumentDetailScreen", "Default"],
    ["Features/Documents/Screens/DocumentDetailScreen", "Child"],
    ["Features/Household/Screens/HabitantDetailScreen", "Default"],
    ["Features/Household/Screens/HabitantDetailScreen", "Child"],
    ["Features/Shopping/Screens/ShoppingItemScreen", "Default"],
    ["Features/Shopping/Screens/ShoppingItemScreen", "Child"],
    ["Features/Energy/Screens/EnergyMeterScreen", "Default"],
    ["Features/Energy/Screens/EnergyMeterScreen", "Child"],
    ["Features/Energy/Screens/EnergySourceScreen", "Default"],
    ["Features/Energy/Screens/EnergySourceScreen", "Battery"],
  ]) {
    for (const theme of ["light", "dark"]) {
      await openStory(title, example);
      await page.waitForFunction(() => document.querySelector("#storybook-root")?.textContent?.trim().length > 0);
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
      await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${title}/${example}/${theme} fits the phone`);
      await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("#storybook-root"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })));
      accessibility.push({ title, example, theme, width: 320, violations });
      assert.deepEqual(violations, [], `${title}/${example}/${theme}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });

  await openStory("Features/Contacts/Screens/ContactDetailScreen", "Default");
  assert.equal(await page.locator('a[href^="tel:"]').count(), 2);
  assert.equal(await page.locator('a[href^="mailto:"]').count(), 2);
  const contactProject = new URL(await page.getByRole("link", { name: "Badkamer renovatie", exact: true }).getAttribute("href"), base);
  assert.equal(contactProject.pathname, "/projects/pr-bathroom");
  await page.getByRole("button", { name: "Edit Jan Peeters", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await openStory("Features/Contacts/Screens/ContactDetailScreen", "Child");
  assert.equal(await page.getByRole("button", { name: "Edit Jan Peeters", exact: true }).count(), 0);
  await openStory("Features/Documents/Screens/DocumentDetailScreen", "Default");
  assert.equal(new URL(await page.getByRole("link", { name: "Household milk", exact: true }).getAttribute("href"), base).pathname, "/inventory/products/p-milk");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await openStory("Features/Documents/Screens/DocumentDetailScreen", "Child");
  assert.equal(await page.getByRole("button", { name: "Rename", exact: true }).count(), 0);
  await openStory("Features/Income/Screens/IncomeSourceScreen", "Default");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await openStory("Features/Income/Screens/IncomeSourceScreen", "Child");
  assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).count(), 0);

  await openStory("Features/Expenses/Screens/RecurringPaymentsScreen", "Default");
  const nextPayments = new URL(await page.getByRole("link", { name: "Next", exact: true }).getAttribute("href"), base);
  assert.equal(nextPayments.searchParams.get("status"), "paid");
  assert.equal(nextPayments.searchParams.get("page"), "3");
  assert.equal(nextPayments.searchParams.get("from"), "/expenses/recurring/series?workspace=overview");
  const historyOrigin = new URL(await page.getByRole("link", { name: "Next", exact: true }).getAttribute("href"), base).searchParams.get("from");
  assert.ok(historyOrigin);
  await openStory("Features/Energy/Screens/ApplianceDetailScreen", "Default");
  const parentBranch = page.getByRole("link", { name: "Kitchen circuit", exact: true });
  const branchHref = new URL(await parentBranch.getAttribute("href"), base);
  assert.equal(branchHref.pathname, "/energy/appliances/kitchen");
  assert.match(branchHref.searchParams.get("from"), /date%3D2026-10-01/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: /Included in this meter branch/ }).waitFor();
  await page.keyboard.press("Escape");
  await openStory("Features/Energy/Screens/ApplianceDetailScreen", "Child");
  assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).count(), 0);
  await openStory("Features/Income/Screens/IncomeScreen", "ThisMonth");
  const incomeNav = page.getByRole("navigation", { name: "Income views" });
  await incomeNav.getByRole("link", { name: "Received", exact: true }).click();
  await page.getByRole("combobox").first().click();
  const person = page.getByRole("option").last();
  const selectedPerson = await person.textContent();
  await person.click();
  assert.match(await incomeNav.getByRole("link", { name: "Expected", exact: true }).getAttribute("href"), /person=/);
  await incomeNav.getByRole("link", { name: "Expected", exact: true }).click();
  await incomeNav.locator('a[aria-current="page"]').filter({ hasText: "Expected" }).waitFor();
  assert.equal(await page.getByRole("combobox").count(), 0);
  await incomeNav.getByRole("link", { name: "Received", exact: true }).click();
  await incomeNav.locator('a[aria-current="page"]').filter({ hasText: "Received" }).waitFor();
  assert.equal(await page.getByRole("combobox").first().textContent(), selectedPerson);
  await incomeNav.getByRole("link", { name: "Recurring sources", exact: true }).click();
  await incomeNav.locator('a[aria-current="page"]').filter({ hasText: "Recurring sources" }).waitFor();
  assert.equal(await incomeNav.locator('[aria-current="page"]').count(), 1);
  assert.equal(await page.getByRole("combobox").count(), 0);

  await openStory("Features/Money/Screens/MoneyFlowScreen", "ThisMonth");
  const accountActivity = page.locator('a[href*="tab=history"][href*="account="]').first();
  await accountActivity.waitFor();
  const accountId = new URL(await accountActivity.getAttribute("href"), base).searchParams.get("account");
  await accountActivity.click();
  const moneyNav = page.getByRole("navigation", { name: "Money views" });
  await moneyNav.locator('a[aria-current="page"]').filter({ hasText: "Account history" }).waitFor();
  const accounts = page.getByRole("radiogroup", { name: "Account history", exact: true });
  assert.equal(await accounts.getByRole("radio", { checked: true }).inputValue(), accountId);
  await moneyNav.getByRole("link", { name: "Overview", exact: true }).click();
  await moneyNav.locator('a[aria-current="page"]').filter({ hasText: "Overview" }).waitFor();
  await moneyNav.getByRole("link", { name: "Account history", exact: true }).click();
  await moneyNav.locator('a[aria-current="page"]').filter({ hasText: "Account history" }).waitFor();
  assert.equal(await accounts.getByRole("radio", { checked: true }).inputValue(), accountId);

  await openStory("Features/Settings/Screens/SettingsScreen", "Default");
  await page.getByRole("link", { name: "Household", exact: true }).click();
  await page.getByRole("heading", { name: "Household", exact: true, level: 1 }).waitFor();
  assert.equal(await page.locator("#household").count(), 1);
  assert.equal(await page.locator("#waste").count(), 0);
  await page.getByRole("link", { name: "All settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings", exact: true, level: 1 }).waitFor();
  await page.getByRole("link", { name: "Weather", exact: true }).waitFor();
  assert.equal(await page.locator("#household").count(), 0);
  await openStory("Features/Settings/Screens/SettingsScreen", "LegacyWasteLink");
  await page.getByRole("heading", { name: "Waste collection", exact: true, level: 1 }).waitFor();
  assert.equal(await page.locator("#waste").count(), 1);
  assert.equal(await page.locator("#household").count(), 0);

  await openStory("Features/Tasks/Components/DeviceTasksPanel", "Default");
  await page.getByRole("button", { name: "Plan maintenance", exact: true }).click();
  const maintenance = page.getByRole("dialog");
  await maintenance.waitFor();
  assert.equal(await maintenance.locator('input[name="deviceId"]').inputValue(), "device-boiler");
  await page.keyboard.press("Escape");
  await openStory("Features/Tasks/Components/DeviceTasksPanel", "Child");
  assert.equal(await page.getByRole("button", { name: "Plan maintenance", exact: true }).count(), 0);

  const result = { ownerNavigationAndMaintenanceChecks: true, productWorkspaceAndRecurringChecks: true, keyboardAndSplitActionChecks: true, checkedStories: checked, englishAndDutch: checked > 0, lightAndDark: checked > 0, smallestPhoneWidth: 320, accessibility, failures, errors, apiRequests };
  await mkdir("/tmp/wh-redesign", { recursive: true });
  await writeFile("/tmp/wh-redesign/storybook-verification.json", JSON.stringify(result, null, 2) + "\n");
  assert.deepEqual(failures, []); assert.deepEqual(errors, []); assert.deepEqual(apiRequests, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
