import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const { pages } = JSON.parse(
  await readFile(path.join(root, "catalog.json"), "utf8"),
);
const base = process.env.WH_DESIGN_URL || "http://127.0.0.1:55450";
assert.equal(new URL(base).hostname, "127.0.0.1");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
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
  for (const width of [1440, 390])
    for (const id of ["recipes", "projects", "shopping-products", "devices"]) {
      const record = pages.find((p) => p.id === id);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/?screen=${id}&embed=1&lang=en&view=tiles`, {
        waitUntil: "networkidle",
      });
      const photo = page.locator("[data-record-media] img").first();
      await page.waitForFunction(
        () => document.querySelector("input[value=tiles]")?.checked,
      );
      await photo.evaluate((img) => img.decode());
      assert.ok(
        await photo.evaluate(
          (img) => img.getBoundingClientRect().height >= 170,
        ),
        "Generous image-card region",
      );
      for (const row of record.rows)
        assert.equal(
          await page.getByText(row.label, { exact: true }).count(),
          1,
        );
      await page.getByTitle("List", { exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("view") === "list");
      await page.waitForFunction(
        () => document.querySelector("input[value=list]")?.checked,
      );
      assert.equal(await page.locator("input[value=list]").isChecked(), true);
      assert.equal(
        await photo.evaluate((img) =>
          Math.round(img.getBoundingClientRect().height),
        ),
        48,
        "List retains thumbnails",
      );
      await page.goto(`${base}/?screen=${id}&embed=1&lang=en`, {
        waitUntil: "networkidle",
      });
      assert.equal(
        await page.locator("input[value=list]").isChecked(),
        true,
        "View preference survives navigation",
      );
      await page.getByTitle("Tiles", { exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("view") === "tiles");
      await page.waitForFunction(
        () => document.querySelector("input[value=tiles]")?.checked,
      );
      await photo.evaluate((img) => img.decode());
      assert.ok(
        await photo.evaluate(
          (img) => img.getBoundingClientRect().height >= 170,
        ),
      );
      for (const row of record.rows)
        assert.equal(
          await page.getByText(row.label, { exact: true }).count(),
          1,
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      checked++;
    }
  for (const id of ["project-detail", "recipe-detail", "device-detail"]) {
    await page.goto(`${base}/?screen=${id}&embed=1&lang=en`, {
      waitUntil: "networkidle",
    });
    const banner = page.locator("[data-record-media] img").first();
    await banner.evaluate((img) => img.decode());
    assert.equal(
      await banner.evaluate((img) =>
        Math.round(
          img.getBoundingClientRect().height -
            img.parentElement.getBoundingClientRect().height,
        ),
      ),
      0,
      "Image fits its banner region",
    );
    checked++;
  }
  await page.goto(
    `${base}/?screen=shopping-products&embed=1&lang=en&view=tiles`,
    { waitUntil: "networkidle" },
  );
  assert.equal(
    await page
      .locator("[data-record-media=milk] img")
      .evaluate((img) => getComputedStyle(img).objectFit),
    "contain",
  );
  assert.ok(await page.locator("[data-record-media=fallback] svg").count());
  checked++;
  await page.route("**/*bathroom*.jpg", (route) => route.abort());
  await page.goto(`${base}/?screen=project-detail&embed=1&lang=en`, {
    waitUntil: "networkidle",
  });
  await page
    .locator("[data-record-media=bathroom] img")
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.locator("[data-record-media=bathroom] svg").count(),
    1,
  );
  checked++;
  assert.deepEqual(errors, []);
  const result = {
    checkedMediaCases: checked,
    largeCovers: true,
    cardAndListModes: true,
    rememberedView: true,
    thumbnailRows: true,
    containedProductPhotos: true,
    missingAndFailedImageFallback: true,
    browserErrors: errors,
    realApiRequests: 0,
  };
  await writeFile(
    path.join(root, "media-verification.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
