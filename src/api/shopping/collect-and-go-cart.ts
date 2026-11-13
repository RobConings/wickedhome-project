import type { Page } from "playwright";
import { HttpError } from "../lib/http";
import { collectAndGoUrlSchema, type CollectAndGoCart } from "@/features/shopping/types/collect-and-go";
import { euroCents } from "./collect-and-go-pricing";

const unverified = () => new HttpError(409, "collectandgo_unverified", "The signed-in Collect&Go basket could not be verified. A guest basket or product search is not proof of account access. Open Collect&Go in your normal browser and reconnect, or report the changed basket layout.");
const cartName = /(?:winkelwagen|winkelmand(?:je)?|shopping\s*(?:cart|basket))/i;

/** Navigation uses only a basket link observed on the actual shop page. No guessed API or checkout URL. */
export async function openCollectAndGoCart(page: Page, checkPage: () => Promise<unknown>) {
  await checkPage();
  const links = await page.getByRole("link").evaluateAll((elements) => elements.filter((element) => element.getClientRects().length).map((element) => ({ href: element.getAttribute("href"), label: element.getAttribute("aria-label") ?? element.textContent ?? "" })));
  const urls = [...new Set(links.filter((link) => cartName.test(link.label)).flatMap((link) => {
    if (!link.href) return [];
    try {
      const url = new URL(link.href, page.url());
      return url.origin === "https://www.collectandgo.be" && !url.username && !url.password && !url.search && url.pathname.startsWith("/nl/") && /(?:cart|basket|winkelwagen|winkelmand)/i.test(url.pathname) && !/checkout|bestel|confirm|afreken|remove|delete|add/i.test(url.pathname) ? [url.href] : [];
    } catch { return []; }
  }))];
  if (urls.length !== 1) throw unverified();
  await page.goto(urls[0]!, { waitUntil: "domcontentloaded" });
  await checkPage();
  // Let the shop render its account and cart state, without choosing a product or touching quantity controls.
  await page.getByRole("heading", { name: cartName }).first().waitFor({ state: "visible" });
  const account = page.getByRole("button", { name: /^(mijn (?:xtra|account)|profiel|account)$/i }).filter({ visible: true });
  if (await account.count() === 1 && await account.getAttribute("aria-expanded") === "false") await account.click();
  return readCollectAndGoCartOnPage(page);
}

/** Fail closed: explicit signed-in evidence AND basket evidence are required, even for an empty cart. */
export async function readCollectAndGoCartOnPage(page: Page): Promise<CollectAndGoCart> {
  const raw = await page.evaluate(() => {
    const signedIn = Array.from(document.querySelectorAll("a,button")).some((element) => (element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden") && /^(?:afmelden|uitloggen|log\s*out|sign\s*out)$/i.test((element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim()));
    const main = document.querySelector("main,[role=main]");
    const heading = main && Array.from(main.querySelectorAll("h1,h2,[role=heading]")).find((element) => (element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden") && /^(?:mijn |je |jouw |uw |your )?(?:winkelwagen|winkelmand(?:je)?|shopping\s*(?:cart|basket))(?:\s*\(\d+\))?$/i.test((element.textContent ?? "").replace(/\s+/g, " ").trim()));
    if (!main || !heading) return { signedIn, cart: false, empty: false, rows: [], unresolved: true };
    const scope = heading.closest("section,[role=region]") ?? main;
    const empty = /(?:winkelwagen|winkelmand(?:je)?).{0,40}(?:is |nog )?leeg|(?:cart|basket).{0,30}(?:is )?empty/i.test((scope.textContent ?? "").replace(/\s+/g, " ").trim());
    const seen = new Set<Element>();
    const rows: { name: string; url: string; quantity: string; price: string | null }[] = [];
    let unresolved = false;
    for (const anchor of Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href*="/nl/assortiment/"]')).filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden")) {
      const row = anchor.closest('.ds-product-tile,[class*="cart-item"],[class*="basket-item"],[class*="product-row"],li,tr');
      // Ignore product recommendations outside the actual quantity-bearing cart rows.
      if (!row || seen.has(row)) continue;
      seen.add(row);
      const inputs = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="number"],input[inputmode="numeric"]')).filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      if (inputs.length !== 1) { unresolved = true; continue; }
      rows.push({ name: (row.querySelector('.ds-product-tag [role="heading"],h3,[data-product-name]')?.textContent ?? anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300), url: anchor.href, quantity: inputs[0]!.value, price: row.querySelector('.ds-product-price__price .sr-only')?.textContent ?? null });
    }
    return { signedIn, cart: true, empty, rows: rows.slice(0, 500), truncated: rows.length > 500, unresolved };
  });
  if (!raw.signedIn || !raw.cart || raw.unresolved || (!raw.rows.length && !raw.empty) || (raw.rows.length && raw.empty)) throw unverified();
  const items = raw.rows.map((row) => {
    const quantity = Number(row.quantity.trim().replace(",", "."));
    if (!row.name || !collectAndGoUrlSchema.safeParse(row.url).success || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw unverified();
    return { name: row.name, url: row.url, quantity, unitPriceCents: euroCents(row.price) };
  });
  return { authenticated: true, observedAt: new Date().toISOString(), items, truncated: raw.truncated ?? false };
}
