import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const directory = path.resolve("dist/storybook");
const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
const names = /\/(?:AppShell|HomeRoomMap|EntityMultiPicker|ImageChoiceGrid|RecordImage|RecordLink|RecordOrigin|RecordProgress|RelatedRecordCards|SectionNavigation|ShoppingNavigation|IncomeScreen|SettingsScreen|MoneyFlowScreen|DeviceFormField|DeviceTasksPanel|GoodsAllocationDialog|PurchaseDetailScreen|PurchasesScreen|ProductContextPanels|PlaceDevicesSection|PlaceProjectsSection|LinkedImagePicker|ExpenseAllocationPanel|HaDeviceControlPanel|HaScenesPanel|PurchasePaymentsPanel|SessionPayments|SessionStartCard|SessionExtraDialog|SessionsScreen|ShopDestinationPicker|ShopGroupFormDialog|SessionItemAdjustDialog)$/;
const examples = new Set(["Default", "ThisMonth", "Expected", "Received", "Sources", "Household", "LegacyWasteLink", "SectionFailed", "Start", "Checklist", "Child", "Empty", "Offline", "NoCapabilities", "Missing", "Failed", "Complete", "Loading", "NestedDestination", "PersistentPhoneNavigation"]);
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
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  for (const [locale, theme, width] of [["en", "light", 1440], ["nl", "dark", 320]]) {
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
  }
  // Exercise owner navigation rather than treating a successful render as workflow acceptance.
  const openStory = async (title, exportName) => {
    const story = Object.values(index.entries).find((entry) => entry.title === title && entry.exportName === exportName);
    assert.ok(story, `${title}/${exportName}`);
    await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=locale:en;theme:light`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
  };
  await page.setViewportSize({ width: 390, height: 900 });
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

  const result = { ownerNavigationAndMaintenanceChecks: true, checkedStories: checked, englishAndDutch: true, lightAndDark: true, smallestPhoneWidth: 320, failures, errors, apiRequests };
  await mkdir("/tmp/wh-redesign", { recursive: true });
  await writeFile("/tmp/wh-redesign/storybook-verification.json", JSON.stringify(result, null, 2) + "\n");
  assert.deepEqual(failures, []); assert.deepEqual(errors, []); assert.deepEqual(apiRequests, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
