import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const directory = path.resolve("dist/storybook"), streams = new Set();
const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(`event: ready\ndata: ${JSON.stringify({ type: "ready", at: new Date().toISOString(), data: null })}\n\n`);
    streams.add(res); res.on("close", () => streams.delete(res)); return;
  }
  const file = path.resolve(directory, `.${url.pathname}`);
  if (!file.startsWith(`${directory}${path.sep}`)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((value) => value && existsSync(value)) });
const output = "/tmp/wickedhome-retailer-groceries-ui"; await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage(), errors = []; await page.clock.install(); page.on("pageerror", (error) => errors.push(error.message));
  let allowed = true, expired = false, failure = false, reads = 0, fresh = false, imported = null, hold = null, held = false;
  let collectConnected = false, collectAccess = ["owner", "wife"], adopted = null;
  let verifiedAt = null, rejectCheck = false, checks = 0;
  const collectStatus = () => ({ enabled: true, configured: true, connected: collectConnected, canManage: true, canUse: collectAccess.includes("owner"), needsReconnect: false, legacyAvailable: false, verifiedAt, importedAt: collectConnected ? "2026-11-12T12:00:00Z" : null, members: [{ id: "owner", name: "Rob", role: "owner", allowed: collectAccess.includes("owner") }, { id: "wife", name: "Partner", role: "adult", allowed: collectAccess.includes("wife") }, { id: "child", name: "Child", role: "child", allowed: collectAccess.includes("child") }] });
  let name = "Milk already on Xtra";
  const status = () => ({ configured: true, connected: true, canUse: allowed, canManage: false, needsReconnect: expired, connectedAt: "2026-11-12T12:00:00Z", checkedAt: "2026-11-12T12:00:00Z", placeId: "1234", members: [] });
  const snapshot = () => ({ placeId: "1234", observedAt: "2026-11-12T12:00:00Z", truncated: false, items: [{ id: "retailer-item", name, productId: "123456", quantity: 2, unit: "P", completed: false }] });
  await page.route("**/api/shopping/xtra/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/status")) return route.fulfill({ json: status() });
    if (url.pathname.endsWith("/list")) {
      reads++; fresh = url.searchParams.get("fresh") === "1";
      if (hold) { const wait = hold; held = true; await wait; }
      return failure ? route.fulfill({ status: 502, json: { error: { code: "xtra_unavailable", message: "offline" } } }) : route.fulfill({ json: snapshot() });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/shopping/collect-and-go/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/check")) {
      checks++;
      if (rejectCheck) { verifiedAt = null; return route.fulfill({ status: 409, json: { error: { code: "collectandgo_unverified", message: "guest basket" } } }); }
      verifiedAt = "2026-11-12T12:05:00Z";
      return route.fulfill({ json: { status: collectStatus(), cart: { observedAt: verifiedAt, authenticated: true, truncated: false, items: [{ name: "Milk", url: "https://www.collectandgo.be/nl/assortiment/milk", quantity: 2, unitPriceCents: 162 }] } } });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/adopt")) { adopted = request.postDataJSON(); collectAccess = adopted.userIds; collectConnected = true; }
    else if (request.method() === "POST") { imported = request.postDataJSON(); collectAccess = imported.userIds; collectConnected = true; }
    else if (request.method() === "PUT") collectAccess = request.postDataJSON().userIds;
    else if (request.method() === "DELETE") collectConnected = false;
    return route.fulfill({ json: collectStatus() });
  });
  async function open(title, exported, locale = "en", theme = "dark", width = 390) {
    await page.setViewportSize({ width, height: 900 });
    const story = Object.values(index.entries).find((entry) => entry.title === title && entry.exportName === exported); assert.ok(story, `${title}/${exported}`);
    await page.goto(`${origin}/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale};theme:${theme}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
  }
  for (const locale of ["en", "nl"]) for (const theme of ["light", "dark"]) for (const width of [320, 390, 1440]) {
    await open("Features/Shopping/Screens/ShoppingScreen", "WithXtra", locale, theme, width);
    await page.getByRole("region", { name: locale === "en" ? "Xtra / Colruyt · In-store list" : "Xtra / Colruyt · Winkellijstje" }).waitFor();
    await page.getByText(locale === "en" ? "For buying products yourself in a Colruyt store. The Collect&Go online order basket is separate." : "Om zelf producten te kopen in een Colruyt-winkel. De online bestelmand van Collect&Go staat hier los van.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/groceries-${locale}-${theme}-${width}.png` });
    await open("Features/Shopping/Components/CollectAndGoSettings", "Default", locale, theme, width);
    await page.getByText(locale === "en" ? "Online ordering" : "Online bestellen", { exact: true }).waitFor();
    await page.getByRole("link", { name: locale === "en" ? "For shopping in a Colruyt store: manage the separate Xtra list" : "Boodschappen in een Colruyt-winkel: beheer het aparte Xtra-lijstje", exact: true }).waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /npm run|npx playwright|COLLECTANDGO_ENABLED/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/collectandgo-${locale}-${theme}-${width}.png` });
    await open("Features/Settings/Screens/SettingsScreen", "RetailerConnections", locale, theme, width);
    await page.getByRole("link", { name: locale === "en" ? /In-store · Xtra \/ Colruyt/ : /In de winkel · Xtra \/ Colruyt/ }).waitFor();
    await page.getByRole("link", { name: /Online · Collect&Go/ }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/retailer-settings-${locale}-${theme}-${width}.png` });
  }
  await open("Features/Settings/Screens/SettingsScreen", "XtraInStore");
  await page.getByRole("heading", { name: "In-store · Xtra / Colruyt", exact: true }).waitFor();
  await page.getByText("In-store shopping", { exact: true }).waitFor();
  await page.getByRole("link", { name: "For online orders: manage the separate Collect&Go basket", exact: true }).click();
  await page.getByRole("heading", { name: "Online · Collect&Go", exact: true }).waitFor();
  await page.getByText("Online ordering", { exact: true }).waitFor();
  assert.equal(await page.getByText("In-store shopping", { exact: true }).count(), 0);
  await page.getByRole("link", { name: "For shopping in a Colruyt store: manage the separate Xtra list", exact: true }).click();
  await page.getByRole("heading", { name: "In-store · Xtra / Colruyt", exact: true }).waitFor();
  const archive = JSON.stringify({ log: { entries: [{ request: { method: "GET", url: "https://www.collectandgo.be/nl/home", headers: [{ name: "cookie", value: "shop-session=private-shop-cookie" }] }, response: { status: 200, content: { mimeType: "text/html", text: "DO NOT FORWARD THIS PRIVATE PAGE" } } }] } });
  await open("Features/Shopping/Components/CollectAndGoSettings", "Default");
  await page.locator("#collectandgo-browser-data").evaluate((element, data) => { const clipboard = new DataTransfer(); clipboard.setData("text/plain", data); element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true })); }, archive);
  await page.getByText("Shop cookies read. Ready to import; retailer access is not yet verified.", { exact: true }).waitFor();
  assert.equal(await page.locator("#collectandgo-browser-data").inputValue(), "");
  await page.getByRole("button", { name: "Import browser session", exact: true }).click();
  await page.getByText("Browser session imported; signed-in basket access has not been verified.", { exact: true }).waitFor();
  assert.equal(imported.state.cookies[0].domain, "www.collectandgo.be"); assert.ok(!JSON.stringify(imported).includes("PRIVATE PAGE"));
  assert.deepEqual(imported.userIds, ["owner", "wife"]);
  const savedImport = JSON.stringify(imported);
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByText("Read 1 product from the online basket.", { exact: true }).waitFor();
  await page.getByText(/^Signed-in online basket last verified:/).waitFor();
  assert.equal(checks, 1); assert.equal(JSON.stringify(imported), savedImport, "Testing never imports a replacement or changes the basket");
  rejectCheck = true;
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByText(/Signed-in basket access could not be verified/).waitFor();
  assert.equal(await page.getByText(/^Signed-in online basket last verified:/).count(), 0, "A failed check cannot retain a verified label");
  assert.equal(checks, 2); rejectCheck = false;
  await page.screenshot({ path: `${output}/collectandgo-shared-imported.png`, fullPage: true });
  await page.getByRole("checkbox").nth(1).uncheck();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("fieldset")?.disabled);
  assert.deepEqual(collectAccess, ["owner"]);
  collectConnected = false; collectAccess = ["owner", "wife"];
  await open("Features/Shopping/Components/CollectAndGoSettings", "LegacySession");
  await page.getByRole("button", { name: "Share my saved session", exact: true }).click();
  await page.getByText("Browser session imported; signed-in basket access has not been verified.", { exact: true }).waitFor();
  assert.deepEqual(adopted, { userIds: ["owner", "wife"] });
  assert.equal(await page.getByRole("button", { name: "Share my saved session", exact: true }).count(), 0);
  await open("Features/Shopping/Components/CollectAndGoSettings", "SelectedAccount");
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Import browser session", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Disconnect everyone", exact: true }).count(), 0);
  await open("Features/Shopping/Components/CollectAndGoSettings", "Disabled");
  assert.equal(await page.getByRole("button", { name: "Test connection", exact: true }).isDisabled(), true);
  await open("Features/Shopping/Components/CollectAndGoSettings", "NativeCart");
  assert.equal(await page.getByRole("button", { name: "Test connection", exact: true }).isEnabled(), true);
  await page.getByText("Reading your online basket is available. Browser functions for product search and basket changes are disabled on the server.", { exact: true }).waitFor();
  await open("Features/Shopping/Components/CollectAndGoSettings", "Default");
  const apiArchive = JSON.stringify({ log: { entries: [{ request: { method: "POST", url: "https://apip.collectandgo.be/gateway/ecomfoodb2c.eshop.wcscartsvcv2/v2/store/1/cart?langId=-11&catalogId=2", headers: [{ name: "WCAuthToken", value: "fixture-token" }, { name: "X-CG-APIKey", value: "fixture-key" }, { name: "Cookie", value: "WC_AUTHENTICATION_1=fixture-cookie; analytics=discard" }], postData: { text: "DO NOT REPLAY THIS WRITE" } }, response: { status: 201, content: { mimeType: "application/json" } } }] } });
  await page.locator("#collectandgo-browser-data").evaluate((element, data) => { const clipboard = new DataTransfer(); clipboard.setData("text/plain", data); element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true })); }, apiArchive);
  await page.getByText("Cart API credentials read. Ready to import; use Test connection after importing to verify signed-in basket access.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Import browser session", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("fieldset")?.disabled);
  assert.equal(imported.state.cartApi.storeId, "1"); assert.equal(imported.state.cartApi.authToken, "fixture-token"); assert.ok(!JSON.stringify(imported).includes("DO NOT REPLAY")); assert.ok(!JSON.stringify(imported).includes("analytics"));
  await open("Features/Shopping/Components/XtraListPanel", "Live");
  await page.getByText(name, { exact: true }).waitFor();
  assert.equal(fresh, true);
  name = "Added from Colruyt on another device";
  await page.clock.fastForward(31000);
  await page.getByText(name, { exact: true }).waitFor();
  const before = reads;
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(61000); assert.equal(reads, before);
  name = "Updated while hidden";
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.getByText(name, { exact: true }).waitFor();
  function emit(reason) { for (const stream of streams) stream.write(`event: shopping.xtra_changed\ndata: ${JSON.stringify({ type: "shopping.xtra_changed", at: new Date().toISOString(), data: { reason } })}\n\n`); }
  name = "Added by MCP"; emit("list");
  await page.getByText(name, { exact: true }).waitFor(); assert.equal(fresh, true);
  failure = true;
  await page.getByRole("button", { name: "Refresh Xtra list" }).click();
  await page.getByText(/Showing the last successfully retrieved list/).waitFor();
  assert.equal(await page.getByText(name, { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("No unchecked items on the Xtra list.", { exact: true }).count(), 0);
  failure = false; expired = true;
  await page.getByRole("button", { name: "Refresh Xtra list" }).click();
  await page.getByText(/Xtra needs a new login/).waitFor();
  expired = false;
  let release; hold = new Promise((done) => { release = done; });
  await page.getByRole("button", { name: "Refresh Xtra list" }).click();
  for (let tries = 0; !held && tries < 100; tries++) await new Promise((done) => setTimeout(done, 10));
  assert.equal(held, true);
  allowed = false; emit("access"); release(); hold = null;
  await page.getByRole("region", { name: "Xtra / Colruyt · In-store list" }).waitFor({ state: "hidden" });
  assert.equal(await page.getByText(name, { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(`Retailer groceries UI: 36 EN/NL mobile/desktop renders; in-store/online channel labels and settings navigation, automatic reads, visible-only polling, focus refresh, MCP events, stale/expired reads, revoked in-flight reads, and Collect&Go shared grants, explicit legacy adoption and import without CLI passed. Screenshots: ${output}`);
} finally { await browser.close(); for (const stream of streams) stream.end(); await new Promise((done) => server.close(done)); }
