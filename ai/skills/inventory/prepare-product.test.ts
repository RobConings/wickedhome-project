import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { config } from "@/api/lib/config";
import { db } from "@/api/lib/db";
import { fakePageTransport, fakeSearchTransport } from "@/api/web/web-fake";
import { setWebTransportsForTesting } from "@/api/web/web.service";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import { clearOffers, getOffer } from "../recipes/offers";
import "./tools";

const user = { id: "setup-user", name: "Rob", email: "test@example.com", role: "adult" as const, locale: "en" as const, householdId: "setup-household", householdName: "Test", habitantId: null };
const url = "https://market.example/milk";
const photo = "https://market.example/milk.jpg";
const html = (currency = "EUR") => `<html><head><title>Milk 500 ml</title><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "Product", name: "Milk 500 ml", image: photo, gtin13: "5400000000017",
  offers: { "@type": "Offer", price: "1.99", priceCurrency: currency },
})}</script></head><body>Product details</body></html>`;

function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  Reflect.set(target, key, t.mock.fn(implementation));
  t.after(() => { Reflect.set(target, key, original); });
}

function setup(t: TestContext, pageUrl = url, currency = "EUR", results = true) {
  const catalogue = [{ id: "milk", name: "Milk", unit: "pack", category: "DAIRY", isEssential: true, defaultShopId: "market", packageAmount: null, packageUnit: null, barcode: null, qrCode: null, imageUrl: null, notes: null, shopLinks: [], stockProductId: null, alternatives: [] }];
  stub(t, db.product, "findMany", async ({ where }: { where: { householdId: string } }) => {
    assert.equal(where.householdId, user.householdId);
    return catalogue;
  });
  stub(t, db.shop, "findMany", async () => [{
    id: "market", name: "Market", type: "SUPERMARKET", householdId: null, address: null, websiteUrl: "https://market.example", hasWebshop: true, openingHours: null, notes: null,
    householdSettings: [], icon: { websiteUrl: "https://market.example", fetchedAt: null, lastAttemptAt: new Date() },
  }]);
  const pages = fakePageTransport({ [pageUrl]: { body: html(currency) } });
  const search = fakeSearchTransport(results ? [{ title: "Milk 500 ml", url: pageUrl }] : []);
  setWebTransportsForTesting({ pages, search, searchUrl: "http://search.test" });
  clearOffers();
  t.after(() => { setWebTransportsForTesting(null); clearOffers(); });
  return { pages, search, catalogue };
}

type Result = {
  untrusted: boolean; lookup: string; problems: string[];
  existingProducts: { id: string; name: string; matchedBy: string }[];
  online: { name: string; imageUrl: string | null; url: string; barcode: string | null; packageAmount: number | null; packageUnit: string | null; priceCents: number | null; currency: string | null; offer: string | null; shop: { id: string; name: string } | null }[];
};
async function prepare(args: Record<string, unknown>): Promise<Result> {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inventory_prepare_product", arguments: args } }, { user, scope: "read", tokenId: "setup-token", tokenName: "Test" }, new AbortController().signal) as { result: { isError: boolean; structuredContent: Result; content: { text: string }[] } };
  assert.equal(response.result.isError, false, response.result.content[0]?.text);
  return response.result.structuredContent;
}

describe("product preparation over MCP", () => {
  it("proactively compares the catalogue and researches complete, reusable online metadata", async (t) => {
    const { search, pages } = setup(t);
    const result = await prepare({ name: "Milk 500 ml" });
    assert.deepEqual(search.queries, ["Milk 500 ml"]);
    assert.deepEqual(pages.requests, [url]);
    assert.equal(result.existingProducts[0]?.id, "milk");
    assert.equal(result.lookup, "found");
    assert.equal(result.untrusted, true);
    const found = result.online[0]!;
    assert.equal(found.imageUrl, photo);
    assert.equal(found.shop?.id, "market");
    assert.equal(found.priceCents, 199);
    assert.equal(found.barcode, "5400000000017");
    assert.equal(found.packageAmount, 500);
    assert.equal(found.packageUnit, "ml");
    assert.ok(found.offer);
    assert.equal(getOffer(user.householdId, found.offer)?.imageUrl, photo);
    assert.equal(getOffer("another-household", found.offer), null);
  });

  it("reads a supplied product URL directly without performing another search", async (t) => {
    const { search } = setup(t);
    const result = await prepare({ name: "Milk", url });
    assert.equal(result.lookup, "found");
    assert.equal(search.queries.length, 0);
  });

  it("finds a barcode-identical catalogue product even when its stored name is different", async (t) => {
    const { catalogue } = setup(t);
    Object.assign(catalogue[0]!, { name: "Volle melk", barcode: "5400000000017" });
    const result = await prepare({ name: "Milk 500 ml" });
    assert.equal(result.existingProducts[0]?.id, "milk");
    assert.equal(result.existingProducts[0]?.matchedBy, "barcode");
  });

  it("allows an honest no-match result instead of inventing photos or prices", async (t) => {
    setup(t, url, "EUR", false);
    const result = await prepare({ name: "Local handmade product" });
    assert.equal(result.lookup, "not_found");
    assert.deepEqual(result.online, []);
  });

  it("reports unavailable search and keeps catalogue matches usable", async (t) => {
    setup(t);
    const original = config.SEARCH_URL;
    Reflect.set(config, "SEARCH_URL", undefined);
    t.after(() => { Reflect.set(config, "SEARCH_URL", original); });
    setWebTransportsForTesting(null);
    const result = await prepare({ name: "Milk" });
    assert.equal(result.lookup, "incomplete");
    assert.equal(result.existingProducts[0]?.id, "milk");
    assert.match(result.problems.join(" "), /unavailable/);
    assert.deepEqual(result.online, []);
  });

  it("keeps an unknown retailer unlinked and never treats a dollar price as euros", async (t) => {
    setup(t, "https://manufacturer.example/milk", "USD");
    const result = await prepare({ name: "Milk" });
    const found = result.online[0]!;
    assert.equal(found.shop, null);
    assert.equal(found.offer, null);
    assert.equal(found.priceCents, null);
    assert.equal(found.currency, "USD");
    assert.equal(found.imageUrl, photo);
  });

  it("retains the SSRF guard for URLs supplied by a connected assistant", async (t) => {
    const { pages } = setup(t);
    const result = await prepare({ name: "Milk", url: "http://127.0.0.1/private" });
    assert.equal(result.lookup, "incomplete");
    assert.deepEqual(result.online, []);
    assert.deepEqual(pages.requests, []);
  });
});
