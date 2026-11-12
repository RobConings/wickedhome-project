import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const directory = path.resolve("dist/storybook");
const output = process.env.COMPONENT_BROWSER_OUTPUT ?? "/tmp/wickedhome-component-composition";
await mkdir(output, { recursive: true });
const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
const entries = Object.values(index.entries).filter((entry) => entry.type === "story");
const screenGroups = Map.groupBy(entries.filter((entry) => /\/screens\//.test(entry.importPath)), (entry) => entry.title);
assert.equal(screenGroups.size, 64, "Every current screen needs a fixture in the component catalogue");
const screens = [...screenGroups.values()].map((stories) => stories.find((story) => story.exportName === "Default") ?? stories[0]);
const compositions = entries.filter((entry) => /^(UI\/Text|Layout\/(Masonry|CanvasOverlay))$/.test(entry.title)
  || /\/(RetailerAccountAccess|RetailerBrowserImport|SessionItemForm|CookingIngredientsTray)$/.test(entry.title)
  || entry.title === "Shared/GeneralList" && entry.exportName.startsWith("Embedded")
  || entry.title === "Shared/DescriptionList" && entry.exportName === "PropertyRows"
  || entry.title === "Shared/Card" && entry.exportName === "HeadingWithAction"
  || entry.title === "Features/Devices/Screens/DeviceProfileEditorScreen" && ["SmokeDetector", "CustomJacuzzi", "NewProfile"].includes(entry.exportName)
  || entry.title === "Layout/PageGrid" && entry.exportName === "NoGap");
const stories = [...screens, ...compositions];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(directory, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
  try { const content = await readFile(file); response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }).end(content); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((value) => value && existsSync(value));
let browser;
const results = [], failures = [];
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // These checks use catalogue fixtures, never household or retailer sessions.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: { error: { code: "fixture_offline", message: "Catalogue fixture" } } }));
  async function open(story, locale = "en", theme = "light", width = 390) {
    errors.length = 0;
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=locale:${locale};theme:${theme}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, theme === "dark");
  }
  for (const [locale, theme, width] of [["en", "light", 320], ["en", "dark", 1440], ["nl", "light", 390], ["nl", "dark", 390]]) {
    for (const story of stories) {
      try {
        await open(story, locale, theme, width);
        assert.deepEqual(errors, [], "No uncaught render errors");
        assert.equal(await page.locator(".sb-errordisplay:visible").count(), 0, "Story rendered successfully");
        assert.doesNotMatch(await page.locator("#storybook-root").innerText(), /Unexpected Application Error|Error rendering story/);
        const overflow = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
        assert.ok(overflow.content <= overflow.width + 1, `Fits ${width}px (${overflow.content}px content)`);
        results.push({ story: story.id, locale, theme, width });
      } catch (error) {
        failures.push({ story: story.id, locale, theme, width, error: error.message });
        console.error(`${story.id}/${locale}/${theme}/${width}: ${error.message}`);
        await page.screenshot({ path: path.join(output, `${story.id}-${locale}-${theme}-${width}-failure.png`) });
      }
    }
    console.log(`Checked ${stories.length} screens/compositions: ${locale}, ${theme}, ${width}px`);
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ screens: screenGroups.size, results, failures }, null, 2));
  const find = (title, name) => { const story = entries.find((entry) => entry.title === title && entry.exportName === name); assert.ok(story, `${title}/${name}`); return story; };
  await open(find("Shared/GeneralList", "Embedded"));
  assert.equal(await page.getByRole("searchbox").count(), 0, "Embedded records have no second search toolbar");
  assert.equal(await page.getByRole("radio").count(), 0, "Embedded records ignore the stored tiles view");
  assert.equal(await page.getByRole("list", { name: "Things" }).getByRole("listitem").count(), 7);
  await open(find("Shared/GeneralList", "EmbeddedEmpty"));
  await page.getByText("Nothing here yet", { exact: true }).waitFor();
  await open(find("Shared/GeneralList", "EmbeddedError"));
  await page.getByText("This list couldn't be loaded", { exact: true }).first().waitFor();
  await open(find("Layout/PageGrid", "NoGap"));
  const grid = await page.locator("#storybook-root .grid-cols-7").evaluate((element) => ({ gap: getComputedStyle(element).gap, columns: getComputedStyle(element).gridTemplateColumns.split(" ").length }));
  assert.equal(grid.gap, "0px", "Calendar-style grids keep zero spacing"); assert.equal(grid.columns, 7);
  await open(find("Features/Recipes/Components/CookingIngredientsTray", "Default"));
  await page.getByRole("button", { name: /2 of 5 ingredients used/ }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Ingredients", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ screens: screenGroups.size, results, failures }, null, 2));
  assert.deepEqual(failures, [], "Every screen and new composition fits mobile and desktop");
  console.log(`Passed ${results.length} renders across all ${screenGroups.size} screens, plus embedded-list, calendar-spacing and mobile-sheet interactions.`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
