import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const directory = path.resolve("dist/storybook");
const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const file = path.resolve(directory, `.${new URL(req.url, "http://localhost").pathname}`);
  if (!file.startsWith(`${directory}${path.sep}`)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((value) => value && existsSync(value)) });
const output = "/tmp/wickedhome-xtra-ui";
await mkdir(output, { recursive: true });
const errors = [];
try {
  const page = await browser.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  const status = { configured: true, connected: true, canUse: true, canManage: true, needsReconnect: false, connectedAt: "2026-11-12T12:00:00Z", checkedAt: "2026-11-12T12:00:00Z", placeId: "1234", members: [{ id: "owner", name: "Rob", role: "owner", allowed: true }, { id: "wife", name: "Partner", role: "adult", allowed: true }] };
  const product = { offer: "xt-123456789012345678901234", productId: "123456", name: "BONI Melk halfvol 6 x 1 l", brand: "BONI", content: "6 x 1 l", imageUrl: null, barcode: "5449000000996", priceCents: 645, unit: "P", url: null, existingProduct: null };
  let savedAccess = null, imports = 0, searches = 0, productSaves = 0, lastConnection = null;
  await page.route("**/api/shopping/xtra/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.endsWith("/access")) { savedAccess = req.postDataJSON().userIds; return route.fulfill({ json: { ...status, members: status.members.map((member) => ({ ...member, allowed: savedAccess.includes(member.id) })) } }); }
    if (url.pathname.endsWith("/connection")) { imports++; lastConnection = req.postDataJSON(); assert.ok(lastConnection.userIds.includes("owner")); return route.fulfill({ json: status }); }
    if (url.pathname.endsWith("/products")) { searches++; return route.fulfill({ json: { products: [product, { ...product, offer: "xt-223456789012345678901234", name: "Existing milk", existingProduct: { id: "existing", name: "Household milk" } }], placeId: "1234", observedAt: "2026-11-12T12:00:00Z" } }); }
    return route.fulfill({ json: status });
  });
  await page.route("**/api/shopping/products", async (route) => { productSaves++; await route.abort(); });
  async function open(title, name, locale, theme, width) {
    await page.setViewportSize({ width, height: 900 });
    const story = Object.values(index.entries).find((entry) => entry.title === title && entry.exportName === name);
    assert.ok(story);
    await page.goto(`${origin}/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale};theme:${theme}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
  }
  for (const locale of ["en", "nl"]) for (const theme of ["light", "dark"]) for (const width of [320, 390, 1440]) {
    await open("Features/Shopping/Components/XtraSettings", "Shared", locale, theme, width);
    await page.getByText(locale === "en" ? "In-store shopping" : "Winkelen in de winkel", { exact: true }).waitFor();
    await page.getByRole("link", { name: locale === "en" ? "For online orders: manage the separate Collect&Go basket" : "Online bestellen: beheer de aparte Collect&Go-winkelmand", exact: true }).waitFor();
    await page.getByRole("checkbox").nth(1).uncheck();
    await page.getByRole("button", { name: locale === "en" ? "Save access" : "Toegang opslaan" }).click();
    await page.waitForFunction(() => !document.querySelector("fieldset")?.disabled);
    assert.deepEqual(savedAccess, ["owner"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/settings-${locale}-${theme}-${width}.png` });
    await open("Features/Shopping/Components/ProductFormDialog", "Create", locale, theme, width);
    await page.getByRole("button", { name: "Add product" }).click();
    await page.getByText(locale === "en" ? "Search Colruyt products · in-store" : "Colruyt-producten zoeken · in de winkel", { exact: true }).click();
    await page.locator("#xtra-product-query").fill("Boni melk");
    await page.locator("#xtra-product-query").press("Enter");
    await page.getByText(locale === "en" ? "Already in your catalogue: Household milk" : "Al in je catalogus: Household milk").waitFor();
    assert.equal(await page.getByRole("button", { name: locale === "en" ? "Use these details" : "Deze gegevens gebruiken" }).count(), 1);
    await page.getByRole("button", { name: locale === "en" ? "Use these details" : "Deze gegevens gebruiken" }).click();
    assert.equal(await page.locator("#product-name").inputValue(), product.name);
    assert.equal(await page.locator("#product-brand").inputValue(), "BONI");
    assert.equal(await page.locator("#product-barcode").inputValue(), product.barcode);
    assert.equal(await page.locator("#product-package-amount").inputValue(), "6");
    assert.equal(await page.locator('input[name="colruytProductId"]').inputValue(), product.productId);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator("#xtra-product-query").isVisible(), false);
    await page.screenshot({ path: `${output}/product-${locale}-${theme}-${width}.png` });
    await page.getByRole("button", { name: locale === "en" ? "Remove link" : "Koppeling verwijderen", exact: true }).click();
    assert.equal(await page.locator('input[name="colruytProductId"]').inputValue(), "");
  }
  await open("Features/Shopping/Components/XtraSettings", "Reconnect", "en", "dark", 390);
  const archive = JSON.stringify({ log: { entries: [{ request: { method: "GET", url: "https://apix.colruyt.be/gateway/emec.colruyt.bffsvc/cg/latest-shopping-list?placeId=1234", headers: [{ name: "Cookie", value: "clpbff_session=normal-browser-session; analytics=discard-analytics" }, { name: "x-cg-apikey", value: "browser-key" }] }, response: { status: 200, content: { text: "PRIVATE LIST CONTENT" } } }] } });
  await page.locator("#xtra-browser-data").evaluate((element, data) => { const clipboard = new DataTransfer(); clipboard.setData("text/plain", data); element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true })); }, archive);
  await page.getByText("Connection details read. Ready to verify for the selected accounts.", { exact: true }).waitFor();
  assert.equal(await page.locator("#xtra-browser-data").inputValue(), "");
  await page.getByRole("button", { name: "Verify and connect" }).click();
  await page.getByText("Shared connection available on your devices", { exact: true }).waitFor();
  assert.deepEqual(lastConnection.credentials, { sessionId: "normal-browser-session", apiKey: "browser-key", placeId: "1234" });
  assert.ok(!JSON.stringify(lastConnection).includes("PRIVATE LIST CONTENT")); assert.ok(!JSON.stringify(lastConnection).includes("discard-analytics"));
  await open("Features/Shopping/Components/XtraSettings", "Reconnect", "en", "dark", 390);
  await page.getByText("Alternative: desktop helper or existing connection file", { exact: true }).click();
  await page.locator("#xtra-connection-file").setInputFiles({ name: "xtra-connection.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ sessionId: "test-session", apiKey: "test-api-key", placeId: "1234" })) });
  await page.getByRole("button", { name: "Verify and connect" }).click();
  await page.getByText("Shared connection available on your devices", { exact: true }).waitFor();
  assert.equal(imports, 2); assert.equal(searches, 12); assert.equal(productSaves, 0); assert.deepEqual(errors, []);
  console.log(`Xtra UI: 24 English/Dutch mobile/desktop light/dark renders, shared account revocation, normal-browser import with minimal server payload, file import and product autofill passed. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
