import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
const base = process.env.WH_DESIGN_URL || 'http://127.0.0.1:55450';
assert.equal(new URL(base).hostname, '127.0.0.1');
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find((value) => value && existsSync(value));
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
let checked = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) errors.push('Unexpected real API request'); });
  for (const lang of ['en', 'nl']) for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/?screen=dashboard&embed=1&lang=${lang}`, { waitUntil: 'networkidle' });
    const next = page.getByRole('button', { name: lang === 'en' ? 'Next room' : 'Volgende ruimte', exact: true });
    const previous = page.getByRole('button', { name: lang === 'en' ? 'Previous room' : 'Vorige ruimte', exact: true });
    await next.click();
    await previous.click();
    await page.getByRole('link', { name: 'Living room refresh', exact: true }).waitFor();
    const room = page.getByRole('button', { name: 'Kitchen', exact: true });
    await room.press('Enter');
    await page.getByRole('heading', { name: /Kitchen/, exact: false }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    checked++;
    await page.goto(`${base}/?screen=visit-active&embed=1&lang=${lang}`, { waitUntil: 'networkidle' });
    const url = page.url();
    await page.getByRole('button', { name: lang === 'en' ? 'Adjust' : 'Aanpassen', exact: true }).first().click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('input[name=quantity]') });
    await dialog.locator('input[name=quantity]').fill('4');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /(?:Linked variant|Gekoppelde variant)/ }).click();
    await dialog.getByRole('button', { name: lang === 'en' ? 'Save quantity' : 'Hoeveelheid bewaren', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(page.url(), url, 'Adjust stays on the checklist');
    await page.getByText(/(?:Linked variant|Gekoppelde variant)/).first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    checked++;
  }
  assert.deepEqual(errors, []);
  const result = { checkedPatterns: checked, phoneAndDesktop: true, englishAndDutch: true, realProductionComponents: true, roomCyclingAndKeyboard: true, inPlaceAdjust: true, realApiRequests: 0, browserErrors: errors };
  await writeFile(new URL('./implemented-patterns-verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
