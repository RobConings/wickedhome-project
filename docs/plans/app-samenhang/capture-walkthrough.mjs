import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const frames = JSON.parse(
  await readFile(path.join(root, "preview/walkthrough-data.json"), "utf8"),
);
const base = process.env.WH_DESIGN_URL || "http://127.0.0.1:55450";
if (new URL(base).hostname !== "127.0.0.1")
  throw new Error("Capture only the local design preview");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
await mkdir(path.join(root, "preview/wireframes"), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      errors.push("Unexpected API request");
  });
  for (const f of frames) {
    await page.setViewportSize({
      width: f.format === "mobile" ? 390 : 1440,
      height: f.format === "mobile" ? 844 : 1000,
    });
    await page.goto(`${base}/?screen=${f.screen}&embed=1&lang=en`, {
      waitUntil: "networkidle",
    });
    await page.locator("h1").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (f.id === "visit-start") {
      await page.getByRole("combobox").click();
      await page.getByText("Colruyt group", { exact: true }).first().waitFor();
      await page.waitForTimeout(350);
    }
    if (f.id === "visit-adjust") {
      await page.getByRole("button", { name: "Adjust", exact: true }).first().click();
      await page.getByRole("dialog").waitFor();
    }
    if (f.id === "visit-active") {
      await page
        .getByRole("button", { name: /Tomato paste.*purchased/ })
        .click();
      await page
        .getByRole("button", { name: /Boni semi-skimmed milk.*purchased/ })
        .click();
      await page
        .getByRole("button", { name: "Not now", exact: true })
        .last()
        .click();
    }
    await page.addStyleTag({
      content:
        'header.sticky, nav[aria-label="Daily navigation"] {position:static !important;}',
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(root, "preview/wireframes", f.image),
      fullPage: true,
      animations: "disabled",
    });
    console.log(`Captured ${f.id}`);
  }
  // The same relationship navigation at desktop and phone size, matching the project subview example.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(
      `${base}/?screen=project-tasks&embed=1&lang=en&from=project-documents`,
      { waitUntil: "networkidle" },
    );
    await page.locator('nav[aria-label="Related records"]').waitFor();
    await page.addStyleTag({
      content:
        'header.sticky, nav[aria-label="Daily navigation"] {position:static !important;}',
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(
        root,
        "preview/wireframes",
        width === 390
          ? "related-cards-mobile.png"
          : "related-cards-desktop.png",
      ),
      fullPage: true,
      animations: "disabled",
    });
  }
  // Export an annotated three-frame board for reviewing the complete shopping journey at a glance.
  await page.setViewportSize({ width: 1320, height: 1100 });
  const boardFrames = [
    [
      "start.png",
      "1 · Choose a shop or group",
      "One shared selection, with favourites and recent choices.",
    ],
    [
      "checklist.png",
      "2 · Purchase, adjust or skip",
      "Large targets, actual quantities, alternatives and extras.",
    ],
    [
      "finish.png",
      "3 · Review and finish",
      "Stock status first. Receipt and expense links are optional.",
    ],
  ];
  await page.setContent(
    `<html lang="en"><head><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f6f4ed;color:#12372b;font-family:system-ui,sans-serif}h1{font-size:32px;margin:0 0 6px;letter-spacing:-1px}body>p{color:#5b6d65;margin:0 0 24px}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}article{min-width:0}h2{font-size:18px;margin:0 0 6px}article p{font-size:13px;min-height:40px;color:#5b6d65;margin:0 0 14px}img{width:100%;display:block;border:1px solid #d9e0d7;border-radius:16px}</style></head><body><h1>A simpler shopping trip</h1><p>WickedHome wireframes · English by default · actual shared components · fictional data</p><section>${boardFrames.map(([image, title, description]) => `<article><h2>${title}</h2><p>${description}</p><img src="${base}/wireframes/${image}"/></article>`).join("")}</section></body></html>`,
    { waitUntil: "load" },
  );
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(
        images.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => (img.onload = resolve)),
        ),
      ),
    );
  await page.screenshot({
    path: path.join(root, "preview/wireframes/shopping-flow.png"),
    fullPage: true,
  });
  console.log("Captured shopping flow board");
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
