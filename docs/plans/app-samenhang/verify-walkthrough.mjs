import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const frames = JSON.parse(
  await readFile(path.join(root, "preview/walkthrough-data.json"), "utf8"),
);
const base = process.env.WH_DESIGN_URL || "http://127.0.0.1:55450";
assert.equal(new URL(base).hostname, "127.0.0.1");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
const site = path.join(root, "site");
const staticServer = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const target = path.resolve(site, "." + decodeURIComponent(url.pathname));
  if (!target.startsWith(site + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(target);
    const type =
      {
        ".html": "text/html",
        ".css": "text/css",
        ".png": "image/png",
        ".js": "text/javascript",
        ".woff2": "font/woff2",
      }[path.extname(target)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }).end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
const built = `http://127.0.0.1:${staticServer.address().port}/walkthrough.html`;
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
let checked = 0;
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      errors.push("Unexpected production API request");
  });
  for (const [url, widths] of [
    [`${base}/walkthrough.html`, [1440, 390]],
    [built, [1440]],
    [pathToFileURL(path.join(root, "preview/walkthrough.html")).href, [1440]],
  ])
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url, { waitUntil: "networkidle" });
      for (const frame of frames) {
        await page.locator(`[data-journey="${frame.journey}"]`).click();
        await page
          .locator(".steps")
          .getByRole("button", { name: frame.step, exact: true })
          .click();
        const article = page.locator(`article#${frame.id}`);
        await article.waitFor({ state: "visible" });
        await article.locator("img").evaluate((img) => img.decode());
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${frame.id} ${width}px overflow`,
        );
        assert.equal(
          await article.getByRole("heading", { name: frame.title }).count(),
          1,
        );
        checked++;
      }
    }
  await page.goto(`${base}/walkthrough.html#project-detail`, {
    waitUntil: "networkidle",
  });
  await page.locator("#project-detail .frame img").click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close full-size view" }).click();
  await page.getByRole("button", { name: "Next step →" }).click();
  await page.locator("#inventory-product").waitFor({ state: "visible" });
  await page.keyboard.press("ArrowLeft");
  await page.locator("#project-detail").waitFor({ state: "visible" });
  assert.deepEqual(errors, []);
  const result = {
    frames: frames.length,
    journeys: new Set(frames.map((f) => f.journey)).size,
    checkedScreens: checked,
    sourceAndBuiltAssets: true,
    portableLocalHtml: true,
    zoomAndKeyboard: true,
    browserErrors: errors,
    realApiRequests: 0,
  };
  await writeFile(
    path.join(root, "walkthrough-verification.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => staticServer.close(resolve));
}
