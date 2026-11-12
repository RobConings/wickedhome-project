import { existsSync } from "node:fs";
import { chromium } from "playwright";

/** Prefer Playwright's installed browser, then an existing desktop Chrome/Chromium. */
export function desktopBrowserExecutable(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (existsSync(chromium.executablePath())) return undefined;
  return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
}

export async function launchDesktopBrowser(command: string, explicit?: string) {
  const instructions = `Run ${command} in a local terminal on your Mac or desktop computer, from its WickedHome checkout. An SSH terminal connected to home-server still runs commands on the server.`;
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error(`This login helper needs a visible desktop browser. This machine has no graphical display. ${instructions}`);
  }
  if (!process.stdin.isTTY) throw new Error(`This login helper needs an interactive terminal so you can complete login and press Enter. ${instructions}`);
  const executablePath = desktopBrowserExecutable(explicit);
  try {
    return await chromium.launch({ headless: false, ...(executablePath && { executablePath }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser launch failed";
    if (/executable doesn't exist|distribution .* not found/i.test(message)) {
      throw new Error(`No desktop browser was found. Install Chrome or run npx playwright install chromium on your desktop, then retry. ${instructions}`, { cause: error });
    }
    if (/XServer|Missing X server|\$DISPLAY/i.test(message)) throw new Error(`The browser cannot access a graphical display. ${instructions}`, { cause: error });
    throw new Error(`The desktop browser could not open: ${message.split("\n")[0]}. Use -- --browser /path/to/chrome to select a browser. ${instructions}`, { cause: error });
  }
}
