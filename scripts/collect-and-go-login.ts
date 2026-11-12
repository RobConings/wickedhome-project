import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { output: { type: "string", default: `${homedir()}/.config/wickedhome/collect-and-go.json` }, browser: { type: "string" } } });
const browser = await chromium.launch({ headless: false, ...(values.browser && { executablePath: values.browser }) });
const terminal = createInterface({ input: stdin, output: stdout });
try {
  const context = await browser.newContext({ locale: "nl-BE" });
  const page = await context.newPage();
  await page.goto("https://www.collectandgo.be/nl/home", { waitUntil: "domcontentloaded" });
  await terminal.question("Sign in yourself in this browser, complete any human verification and select your pickup point. Do not place an order. Press Enter here when ready. ");
  const rawState = await context.storageState();
  // Transfer only this shop's credentials, never unrelated advertising or identity-provider cookies.
  const state = { cookies: rawState.cookies.filter((cookie) => /(^|\.)collectandgo\.be$/.test(cookie.domain)), origins: rawState.origins.filter((origin) => /^https:\/\/([\w-]+\.)?collectandgo\.be$/.test(origin.origin)) };
  const file = resolve(values.output!);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  console.log(`Protected session saved to ${file}. Transfer it to your WickedHome server over SSH, then run collectandgo:import there. Remove this plaintext file after successful import. Never share it in chat.`);
} finally { terminal.close(); await browser.close(); }
