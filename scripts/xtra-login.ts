import { launchDesktopBrowser } from "./lib/desktop-browser";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { xtraCredentialsSchema } from "../src/features/shopping/types/xtra";

const { values } = parseArgs({ options: { output: { type: "string", default: `${homedir()}/.config/wickedhome/xtra-connection.json` }, browser: { type: "string" } } });
const browser = await launchDesktopBrowser("npm run xtra:login", values.browser).catch((error: Error) => { console.error(error.message); process.exit(1); });
const terminal = createInterface({ input: stdin, output: stdout });
try {
  const context = await browser.newContext({ locale: "nl-BE", acceptDownloads: false, serviceWorkers: "block" });
  let apiKey: string | undefined, placeId: string | undefined;
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "https:" || !["apix.colruyt.be", "apip.colruyt.be"].includes(url.hostname) || !url.pathname.startsWith("/gateway/emec.colruyt.")) return;
    const key = request.headers()["x-cg-apikey"];
    if (key) apiKey = key;
    const place = url.searchParams.get("placeId");
    if (place && /^\d{1,12}$/.test(place)) placeId = place;
  });
  const page = await context.newPage();
  await page.goto("https://www.colruyt.be/nl", { waitUntil: "domcontentloaded" });
  await terminal.question("Sign in to Colruyt yourself, complete SMS/browser verification and choose your store. Search for a product and open your shopping list. Do not place an order. Press Enter here when ready. ");
  const cookies = await context.cookies(["https://apix.colruyt.be/", "https://apip.colruyt.be/"]);
  const input = xtraCredentialsSchema.safeParse({ sessionId: cookies.find((cookie) => cookie.name === "clpbff_session")?.value, apiKey, placeId, reese84: cookies.find((cookie) => cookie.name === "reese84")?.value, userAgent: await page.evaluate(() => navigator.userAgent) });
  if (!input.success) throw new Error("The shop session, store or API header was not observed. Sign in, choose a store, search and open your list before exporting. No connection file was written.");
  const file = resolve(values.output!);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(input.data), { mode: 0o600, flag: "wx" });
  console.log(`Protected connection saved to ${file}. In WickedHome Settings → Xtra, choose the permitted accounts and upload this file. Delete the plaintext file after a successful connection. Never share it in chat. An existing file is never overwritten; use --output for a new filename when reconnecting.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "The Xtra connection could not be exported.");
  process.exitCode = 1;
} finally { terminal.close(); await browser.close(); }
