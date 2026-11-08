import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const { pages, meta } = JSON.parse(
  await readFile(path.join(root, "catalog.json"), "utf8"),
);
const base = process.env.WH_DESIGN_URL || "http://127.0.0.1:55450";
assert.equal(new URL(base).hostname, "127.0.0.1");
await mkdir(path.join(root, "screenshots"), { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
const failures = [];
let checked = 0;
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/"))
    errors.push("Unexpected real API request: " + r.url());
});
// Wait for the screen itself, rather than global dev-server idleness (HMR and prebundling
// can keep requests active after the UI is ready). Every atlas state retains its page heading.
async function openScreen(url) {
  // The portable build uses relative assets; enter it through its root, then verify in-app links.
  const target = new URL(url);
  if (process.env.WH_DESIGN_STATIC === "1") target.pathname = "/";
  await page.goto(target.toString(), { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);
}
const shots = new Set([
  "dashboard",
  "project-detail",
  "shopping",
  "visit-start",
  "visit-active",
  "money",
  "inventory-product",
  "purchase-detail",
  "house-live",
  "room-live",
]);
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [i, p] of pages.entries()) {
      try {
        await openScreen(
          `${base}/wireframe/${p.owner}/${p.id}?screen=${p.id}&embed=1`,
        );
        await page.locator("h1").first().waitFor({ timeout: 10000 });
        if (
          (await page.locator("body").innerText()).includes(
            "Unexpected Application Error",
          )
        )
          throw new Error("React route error");
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          failures.push(`${p.id}: ${width}px overflow`);
        if (p.id === "project-detail" && width === 1440)
          assert.equal(
            await page
              .locator("aside")
              .evaluate((e) => getComputedStyle(e).display),
            "flex",
            "Shared Tailwind/AppShell styling must be present",
          );
        if (shots.has(p.id))
          await page.screenshot({
            path: path.join(root, "screenshots", `${p.id}-${width}.png`),
            fullPage: true,
          });
        checked++;
      } catch (e) {
        failures.push(`${p.id} ${width}px: ${e.message}`);
      }
      if (i % 30 === 0)
        console.log(`Verified ${width}px ${i + 1}/${pages.length}`);
    }
  }
  // Representative state surfaces and physical-source feedback.
  for (const id of ["project-detail", "shopping", "money", "house-live"])
    for (const state of [
      "empty",
      "loading",
      "error",
      "denied",
      "conflict",
      ...(id === "house-live" ? ["offline", "stale"] : []),
    ]) {
      const p = pages.find((p) => p.id === id);
      await openScreen(
        `${base}/wireframe/${p.owner}/${id}?screen=${id}&embed=1&state=${state}`,
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        failures.push(`${id}/${state}: overflow`);
      if (state === "denied")
        assert.equal(
          await page
            .getByText("You do not have access to these records", {
              exact: true,
            })
            .count(),
          1,
        );
      checked++;
    }
  // Single destination selection with the actual shared EntityPicker; no shop checkbox matrix.
  await openScreen(
    `${base}/wireframe/shopping/visit-start?screen=visit-start&embed=1`,
  );
  assert.equal(await page.locator("input[type=checkbox]").count(), 0);
  await page.getByRole("combobox").click();
  await page.getByText("Colruyt group", { exact: true }).first().click();
  await page.getByRole("button", { name: /Start shopping/ }).click();
  await page
    .getByRole("heading", { name: /Colruyt group/ })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: /Boni semi-skimmed milk.*purchased/ })
    .click();
  await page.getByText("1 of 3 completed", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Not now", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByText("1 of 3 completed", { exact: true }).count(),
    1,
    "Switching bought to skipped cannot count a row twice",
  );
  // The links travel across owners and preserve a return context.
  await openScreen(
    `${base}/wireframe/projects/project-detail?screen=project-detail&embed=1`,
  );
  await page.getByRole("link", { name: /Materials · 3/ }).click();
  await page
    .getByRole("heading", { name: "Bathroom · requirements" })
    .waitFor();
  await page
    .getByRole("link", { name: /White mounting adhesive/ })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "White mounting adhesive",
      exact: true,
      level: 1,
    })
    .waitFor();
  assert.ok((await page.locator("body").innerText()).includes("Opened from"));
  // Both languages, shared states and dark-mode variants retain the same composition.
  for (const lang of ["en", "nl"])
    for (const id of [
      "project-detail",
      "visit-start",
      "visit-active",
      "shopping",
      "house-live",
      "room-live",
      "product-form-dialog",
      "money",
    ]) {
      const p = pages.find((p) => p.id === id);
      await openScreen(
        `${base}/wireframe/${p.owner}/${id}?screen=${id}&embed=1&lang=${lang}&theme=dark`,
      );
      assert.equal(
        await page.locator("html").getAttribute("lang"),
        lang + "-BE",
      );
      assert.equal(
        await page
          .locator("html")
          .evaluate((el) => el.classList.contains("dark")),
        true,
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        failures.push(`${id}/${lang}/dark: overflow`);
      checked++;
    }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openScreen(`${base}/?screen=project-detail`);
  assert.equal(await page.locator("html").getAttribute("lang"), "en-BE");
  await page.getByText("Dutch", { exact: true }).click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Badkamer vernieuwen", level: 1 })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "nl-BE");
  await page.getByText("English", { exact: true }).click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Bathroom renovation", level: 1 })
    .waitFor();
  checked += 2;
  // The chosen destination determines the actual example checklist.
  await openScreen(`${base}/?screen=visit-start&embed=1`);
  await page.getByRole("combobox").click();
  await page.getByText("Gamma", { exact: true }).first().click();
  await page.getByRole("button", { name: /Start shopping/ }).click();
  await page
    .getByRole("heading", { name: "Gamma · Shopping trip", level: 1 })
    .waitFor();
  await page.getByText("White mounting adhesive", { exact: true }).waitFor();
  // Groups are composed with the existing picker and removable selected rows.
  await openScreen(`${base}/?screen=shop-group-form&embed=1`);
  const groupDialog = page.getByRole("dialog");
  await groupDialog.getByRole("combobox").click();
  await page.getByText("Gamma", { exact: true }).first().click();
  await groupDialog.getByText("Gamma", { exact: true }).waitFor();
  await groupDialog
    .getByRole("button", { name: "Remove", exact: true })
    .last()
    .click();
  await groupDialog
    .getByText("Gamma", { exact: true })
    .waitFor({ state: "hidden" });
  checked += 2;
  // Related summaries are full-card links with a current state and phone-sized targets.
  let relatedNavigationCases = 0;
  for (const lang of ["en", "nl"])
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await openScreen(
        `${base}/?screen=project-tasks&embed=1&lang=${lang}&from=project-documents&view=list&q=cabinet`,
      );
      const nav = page.locator("nav.related-record-grid");
      await nav.waitFor();
      const links = nav.locator("a");
      assert.equal(await links.count(), 5);
      const columns = await nav.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter((size) => parseFloat(size) > 0).length,
      );
      assert.equal(columns, width < 640 ? 2 : 5);
      for (const link of await links.all()) {
        const box = await link.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 76);
        assert.equal(
          await link.locator("svg").count(),
          1,
          "Each card has its semantic icon",
        );
        assert.equal(
          await link.locator("button,a").count(),
          0,
          "One link covers the entire card",
        );
      }
      const current = nav.locator("a[aria-current=location]");
      assert.equal(await current.count(), 1);
      assert.ok(
        (await current.getAttribute("href")).includes("screen=project-tasks"),
      );
      await current.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        new URL(page.url()).searchParams.get("from"),
        "project-documents",
      );
      assert.equal(new URL(page.url()).searchParams.get("view"), "list");
      assert.equal(new URL(page.url()).searchParams.get("q"), "cabinet");
      await nav
        .locator('a[href*="screen=project-materials"]')
        .click({ position: { x: 6, y: 6 } });
      await nav
        .locator('a[aria-current=location][href*="screen=project-materials"]')
        .waitFor();
      assert.equal(
        new URL(page.url()).searchParams.get("from"),
        "project-tasks",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      relatedNavigationCases++;
    }
  await openScreen(`${base}/?screen=product-stock&embed=1&lang=nl`);
  assert.equal(await page.locator("nav.related-record-grid a").count(), 4);
  await openScreen(`${base}/?screen=project-tasks&embed=1&state=denied`);
  assert.equal(await page.locator("nav.related-record-grid").count(), 0);
  relatedNavigationCases += 2;
  const result = {
    ...meta,
    checkedViews: checked,
    relatedNavigationCases,
    browserErrors: [...new Set(errors)],
    failures,
    realApiRequests: 0,
  };
  await writeFile(
    path.join(root, "verification.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
