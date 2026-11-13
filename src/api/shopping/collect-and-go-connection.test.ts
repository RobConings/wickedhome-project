import assert from "node:assert/strict";
import { after, afterEach, before, it, mock } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import type { SessionUser } from "@/features/auth/types/auth";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { decryptSecret } from "../lib/secrets";
import { collectAndGoStatus, readCollectAndGoConnection, requireCollectAndGoAccess, withCollectAndGoConnection } from "./collect-and-go-connection";
import { adoptCollectAndGoSession, disconnectCollectAndGoBrowser, importCollectAndGoSession, readCollectAndGoCart, readCollectAndGoOrders, readCollectAndGoOrder, rememberedCollectAndGoOffer, searchCollectAndGo, setCollectAndGoAccess, setCollectAndGoBasket } from "./collect-and-go-browser";
import { readCollectAndGoSession, saveCollectAndGoSession } from "./collect-and-go-session";
const actor = (id: string, householdId = id, role: SessionUser["role"] = "owner"): SessionUser => ({ id, householdId, role, email: `${id}@example.test`, name: id, locale: "en", householdName: "Home", habitantId: null });
const signal = () => new AbortController().signal;
const state = { cookies: [{ name: "session", value: "shared-cookie-private", domain: "www.collectandgo.be", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }], origins: [] };
let directory = "";
const previous = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY, enabled: process.env.COLLECTANDGO_ENABLED, members: Reflect.get(db.user, "findMany"), audit: Reflect.get(db.auditEntry, "create") };
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "collectandgo-shared-")); config.STORAGE_DIR = join(directory, "files"); config.INTEGRATIONS_KEY = Buffer.alloc(32, 5).toString("base64"); process.env.COLLECTANDGO_ENABLED = "1";
  Reflect.set(db.user, "findMany", async ({ where }: { where: { householdId: string; disabledAt: null } }) => {
    assert.equal(where.disabledAt, null);
    return [where.householdId, `${where.householdId}-wife`, `${where.householdId}-child`].map((id) => ({ id, email: `${id}@example.test`, role: id.endsWith("child") ? "CHILD" : id.endsWith("wife") ? "ADULT" : "OWNER", habitant: { name: id } }));
  });
  Reflect.set(db.auditEntry, "create", async () => ({}));
});
afterEach(() => mock.restoreAll());
after(async () => { config.STORAGE_DIR = previous.storage; config.INTEGRATIONS_KEY = previous.key; if (previous.enabled === undefined) delete process.env.COLLECTANDGO_ENABLED; else process.env.COLLECTANDGO_ENABLED = previous.enabled; Reflect.set(db.user, "findMany", previous.members); Reflect.set(db.auditEntry, "create", previous.audit); await rm(directory, { recursive: true, force: true }); });
function fakeBrowser(body = "Current products", authenticated = true) {
  const options: unknown[] = [];
  const routes: ((route: unknown) => Promise<unknown>)[] = [];
  const launch = mock.method(chromium, "launch", async () => ({
    close: async () => undefined,
    newContext: async (input: unknown) => {
      options.push(input);
      return {
        route: async (_pattern: string, handler: (route: unknown) => Promise<unknown>) => { routes.push(handler); }, storageState: async () => (input as { storageState: typeof state }).storageState,
        newPage: async () => ({ setDefaultTimeout: () => undefined, setDefaultNavigationTimeout: () => undefined, goto: async () => undefined, url: () => "https://www.collectandgo.be/nl/home",
          getByRole: (role: string) => role === "link" ? { evaluateAll: async () => [{ href: "/nl/winkelwagen", label: "Winkelwagen" }] } : role === "heading" ? { first: () => ({ waitFor: async () => undefined }) } : { filter: () => ({ count: async () => 0 }) },
          evaluate: async () => ({ signedIn: authenticated, cart: true, empty: false, unresolved: false, rows: [{ name: "Milk", url: "https://www.collectandgo.be/nl/assortiment/milk", quantity: "2", price: "€ 1,50" }] }),
          locator: (selector: string) => selector === "body" ? { innerText: async () => body } : { first: () => ({ waitFor: async () => undefined }), evaluateAll: async () => [{ name: "Milk", url: "https://www.collectandgo.be/nl/assortiment/milk", image: null, price: "€ 1,50", unitPrice: null, promotion: null }] } }),
      };
    },
  }));
  return { launch, options, routes };
}
it("reads native cart credentials with browser integration disabled and still enforces explicit grants", async () => {
  const owner = actor("native"), wife = actor("native-wife", "native", "adult"), child = actor("native-child", "native", "child");
  const enabled = process.env.COLLECTANDGO_ENABLED; process.env.COLLECTANDGO_ENABLED = "0";
  try {
    const native = { ...state, cookies: [{ ...state.cookies[0]!, name: "WC_AUTHENTICATION_1", domain: "apip.collectandgo.be" }], cartApi: { storeId: "1", catalogId: "2", langId: "-11", authToken: "fixture-token", apiKey: "fixture-key" } };
    await importCollectAndGoSession(owner, { state: native, userIds: [wife.id, child.id] });
    let reads = 0;
    const browser = mock.method(chromium, "launch", async () => { throw Error("Native read must not launch a browser"); });
    mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
      assert.equal(options?.method, "GET"); reads++;
      return Response.json({ resourceName: "cart", orderStatus: "P", orderId: "1", x_xtraEmailId: "fixture@example.test", totalProductPriceCurrency: "EUR", recordSetCount: "0", recordSetTotal: "0", recordSetStartNumber: "0" });
    });
    assert.deepEqual((await readCollectAndGoCart(wife, signal())).items, []);
    assert.equal((await collectAndGoStatus(wife)).enabled, false); assert.equal((await collectAndGoStatus(wife)).cartEnabled, true); assert.ok((await collectAndGoStatus(wife)).verifiedAt);
    assert.deepEqual((await readCollectAndGoCart(child, signal())).items, []);
    await assert.rejects(readCollectAndGoCart(owner, signal()), /don't have access/);
    await setCollectAndGoAccess(owner, []); await assert.rejects(readCollectAndGoCart(wife, signal()), /don't have access/);
    assert.equal(reads, 2); assert.equal(browser.mock.callCount(), 0);
    await setCollectAndGoAccess(owner, [wife.id]); process.env.COLLECTANDGO_ENABLED = "1";
    mock.restoreAll(); fakeBrowser();
    const { offers } = await searchCollectAndGo(wife, "Milk", 1, true, signal());
    assert.equal((await readCollectAndGoConnection(owner.householdId))?.state.cartApi?.authToken, "fixture-token", "Browser observations preserve the native credentials");
    await assert.rejects(setCollectAndGoBasket(wife, offers[0]!.id, 1, signal()), /signed-in www.collectandgo.be browser session/);
  } finally { if (enabled === undefined) delete process.env.COLLECTANDGO_ENABLED; else process.env.COLLECTANDGO_ENABLED = enabled; }
});
it("reads a selected account's cart, records verification, and blocks mutation requests on the browser boundary", async () => {
  const owner = actor("cart"), wife = actor("cart-wife", "cart", "adult"), fake = fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [wife.id] });
  const cart = await readCollectAndGoCart(wife, signal());
  assert.equal(cart.items[0]?.quantity, 2); assert.equal((await collectAndGoStatus(wife)).verifiedAt, cart.observedAt);
  let continued = 0, blocked = 0;
  for (const [url, method] of [["https://www.collectandgo.be/nl/winkelwagen", "GET"], ["https://www.collectandgo.be/nl/winkelwagen", "POST"], ["https://attacker.example/read", "GET"]]) {
    await fake.routes[0]!({ request: () => ({ url: () => url, method: () => method }), continue: async () => { continued++; }, abort: async () => { blocked++; } });
  }
  assert.equal(continued, 1); assert.equal(blocked, 2);
  await assert.rejects(readCollectAndGoCart(owner, signal()), /don't have access/);
  await setCollectAndGoAccess(owner, []);
  await assert.rejects(readCollectAndGoCart(wife, signal()), /don't have access/);
  assert.equal(fake.launch.mock.callCount(), 1);
});
it("never verifies a guest cart or keeps an old verification after a failed check", async () => {
  const owner = actor("guest-cart");
  await importCollectAndGoSession(owner, { state, userIds: [owner.id] });
  fakeBrowser(); await readCollectAndGoCart(owner, signal()); assert.ok((await collectAndGoStatus(owner)).verifiedAt);
  mock.restoreAll(); fakeBrowser("Current products", false);
  await assert.rejects(readCollectAndGoCart(owner, signal()), /could not be verified/);
  assert.equal((await collectAndGoStatus(owner)).verifiedAt, null);
});
it("connects once for selected accounts and protects shared credentials at rest and in status", async () => {
  const owner = actor("shared"), wife = actor("shared-wife", "shared", "adult");
  await importCollectAndGoSession(owner, { state, userIds: [owner.id, wife.id] });
  assert.equal((await requireCollectAndGoAccess(wife)).state.cookies[0]?.value, state.cookies[0]!.value);
  const status = await collectAndGoStatus(wife); assert.equal(status.canUse, true); assert.equal(status.canManage, false); assert.deepEqual(status.members, []);
  assert.ok(!JSON.stringify(status).includes("shared-cookie-private"));
  const file = join(directory, "collect-and-go-shared", `${createHash("sha256").update("shared").digest("hex")}.enc`), sealed = await readFile(file, "utf8");
  assert.ok(!sealed.includes("shared-cookie-private")); assert.equal((await stat(file)).mode & 0o777, 0o600); assert.equal((await stat(join(directory, "collect-and-go-shared"))).mode & 0o777, 0o700);
  assert.throws(() => decryptSecret(sealed, "collect-and-go-shared:another-household"));
});
it("requires owner management and active household grants without implicit owner usage", async () => {
  const owner = actor("management"), wife = actor("management-wife", "management", "adult");
  await importCollectAndGoSession(owner, { state, userIds: [wife.id] });
  await assert.rejects(requireCollectAndGoAccess(owner), /don't have access/);
  await assert.rejects(importCollectAndGoSession(wife, { state, userIds: [] }), /Only household owners/);
  await assert.rejects(setCollectAndGoAccess(wife, []), /Only household owners/);
  await assert.rejects(disconnectCollectAndGoBrowser(wife), /Only household owners/);
  await assert.rejects(setCollectAndGoAccess(owner, ["foreign", "disabled"]), /active accounts from this household/);
  assert.equal((await collectAndGoStatus(wife)).canUse, true);
});
it("uses the same saved session for an allowed wife's browser search", async () => {
  const owner = actor("browser"), wife = actor("browser-wife", "browser", "adult"), fake = fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [owner.id, wife.id] });
  const result = await searchCollectAndGo(wife, "Milk", 1, true, signal());
  assert.equal(result.offers.length, 1); assert.equal(fake.launch.mock.callCount(), 1);
  const input = fake.options[0] as { storageState: { cookies: typeof state.cookies } }; assert.equal(input.storageState.cookies[0]?.value, "shared-cookie-private");
});
it("revokes search, offer previews and pending basket confirmations before any new browser launches", async () => {
  const owner = actor("revocation"), wife = actor("revocation-wife", "revocation", "adult"), fake = fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [wife.id] });
  const { offers } = await searchCollectAndGo(wife, "Milk", 1, true, signal());
  await setCollectAndGoAccess(owner, []);
  await assert.rejects(searchCollectAndGo(wife, "Milk", 1, true, signal()), /don't have access/);
  await assert.rejects(rememberedCollectAndGoOffer(wife, offers[0]!.id), /don't have access/);
  await assert.rejects(setCollectAndGoBasket(wife, offers[0]!.id, 2, signal()), /don't have access/);
  assert.equal(fake.launch.mock.callCount(), 1);
});
it("does not let another account or a replacement session reuse an old offer", async () => {
  const owner = actor("offers"), wife = actor("offers-wife", "offers", "adult"); fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [owner.id, wife.id] });
  const { offers } = await searchCollectAndGo(owner, "Milk", 1, true, signal());
  await assert.rejects(rememberedCollectAndGoOffer(wife, offers[0]!.id), /expired/);
  await importCollectAndGoSession(owner, { state, userIds: [owner.id, wife.id] });
  await assert.rejects(rememberedCollectAndGoOffer(owner, offers[0]!.id), /expired/);
  await assert.rejects(requireCollectAndGoAccess(actor(owner.id, "foreign-household")), /don't have access/);
});
it("permits selected children to search but never change the basket", async () => {
  const owner = actor("children"), child = actor("children-child", "children", "child"), fake = fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [child.id] });
  const { offers } = await searchCollectAndGo(child, "Milk", 1, true, signal());
  await assert.rejects(setCollectAndGoBasket(child, offers[0]!.id, 2, signal()), /Children/);
  assert.equal(fake.launch.mock.callCount(), 1);
});
it("cancels already queued reads when an owner revokes the shared connection", async () => {
  const owner = actor("queued"), wife = actor("queued-wife", "queued", "adult"), fake = fakeBrowser();
  await importCollectAndGoSession(owner, { state, userIds: [wife.id] });
  let release!: () => void;
  const held = withCollectAndGoConnection(owner.householdId, () => new Promise<void>((done) => { release = done; }));
  await new Promise((done) => setTimeout(done, 0));
  const queued = searchCollectAndGo(wife, "Milk", 1, true, signal());
  const rejected = assert.rejects(queued);
  const revoke = setCollectAndGoAccess(owner, []);
  await new Promise((done) => setTimeout(done, 0)); release();
  await Promise.all([held, rejected, revoke]); assert.equal(fake.launch.mock.callCount(), 0);
});
it("keeps legacy personal sessions private until an owner explicitly shares their own session", async () => {
  const owner = actor("legacy"), wife = actor("legacy-wife", "legacy", "adult");
  await saveCollectAndGoSession(owner.id, state);
  assert.equal((await collectAndGoStatus(owner)).legacyAvailable, true);
  assert.equal((await collectAndGoStatus(wife)).connected, false);
  await assert.rejects(requireCollectAndGoAccess(owner), /don't have access/);
  await adoptCollectAndGoSession(owner, [owner.id, wife.id]);
  assert.equal((await collectAndGoStatus(wife)).canUse, true); assert.equal(await readCollectAndGoSession(owner.id), null);
  assert.equal((await collectAndGoStatus(owner)).legacyAvailable, false);
});
it("persists expiry/challenge failures for the shared session and requires owner renewal", async () => {
  const owner = actor("challenge"), wife = actor("challenge-wife", "challenge", "adult"), fake = fakeBrowser("We vermoeden dat je een bot bent. CAPTCHA.");
  await importCollectAndGoSession(owner, { state, userIds: [wife.id] });
  await assert.rejects(searchCollectAndGo(wife, "Milk", 1, true, signal()), /human browser check/);
  assert.equal((await collectAndGoStatus(wife)).needsReconnect, true);
  await assert.rejects(searchCollectAndGo(wife, "Milk", 1, true, signal()), /needs a new login/);
  assert.equal(fake.launch.mock.callCount(), 1);
});
it("disconnects all selected accounts together", async () => {
  const owner = actor("disconnect"), wife = actor("disconnect-wife", "disconnect", "adult");
  await importCollectAndGoSession(owner, { state, userIds: [owner.id, wife.id] });
  await disconnectCollectAndGoBrowser(owner);
  assert.equal(await readCollectAndGoConnection(owner.householdId), null);
  assert.equal((await collectAndGoStatus(wife)).canUse, false);
});

it("reads reservations for selected adults and children with browser integration off; revocation blocks in-flight disclosure", async () => {
  const owner = actor("orders"), wife = actor("orders-wife", "orders", "adult"), child = actor("orders-child", "orders", "child");
  const enabled = process.env.COLLECTANDGO_ENABLED; process.env.COLLECTANDGO_ENABLED = "0";
  try {
    const native = { ...state, cookies: [{ ...state.cookies[0]!, name: "WC_AUTHENTICATION_1", domain: "apip.collectandgo.be" }], cartApi: { storeId: "1", catalogId: "2", langId: "-11", authToken: "fixture-token", apiKey: "fixture-key" } };
    await importCollectAndGoSession(owner, { state: native, userIds: [wife.id, child.id] });
    const raw = { resourceName: "order", orderId: "11", buyerId: "1", orderStatus: "M", locked: "false", x_isAmendable: "true", x_aortDate: "20300101", x_aortTime: "0900", recordSetCount: "0", recordSetTotal: "0", recordSetStartNumber: "0", orderItem: [] };
    let hold: (() => void) | undefined, started: (() => void) | undefined;
    const browser = mock.method(chromium, "launch", async () => { throw Error("Must not launch browser for orders"); });
    mock.method(globalThis, "fetch", async (input: URL | RequestInfo, options?: RequestInit) => {
      assert.equal(options?.method, "GET"); const path = new URL(String(input)).pathname;
      if (path.endsWith("cart/@self")) return Response.json({ resourceName: "cart", orderId: "10", orderStatus: "P", x_xtraEmailId: "fixture@example.test", totalProductPriceCurrency: "EUR", recordSetCount: "0", recordSetTotal: "0", recordSetStartNumber: "0", orderItem: [] });
      if (path.endsWith("@history")) return Response.json({ resourceName: "order", Order: [raw], recordSetCount: "1", recordSetTotal: "1", recordSetStartNumber: "0" });
      if (started) { started(); await new Promise<void>(resolve => { hold = resolve; }); }
      return Response.json(raw);
    });
    assert.equal((await readCollectAndGoOrders(wife, signal())).orders[0]?.id, "11");
    assert.equal((await readCollectAndGoOrder(child, "11", signal())).authenticated, true);
    await assert.rejects(readCollectAndGoOrder(owner, "11", signal()), /don't have access/);
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const pending = readCollectAndGoOrder(wife, "11", signal());
    const rejected = assert.rejects(pending, /connection changed/);
    await waiting;
    const revocation = setCollectAndGoAccess(owner, []); hold!();
    await rejected; await revocation;
    await assert.rejects(readCollectAndGoOrders(wife, signal()), /don't have access/);
    assert.equal(browser.mock.callCount(), 0);
  } finally { if (enabled === undefined) delete process.env.COLLECTANDGO_ENABLED; else process.env.COLLECTANDGO_ENABLED = enabled; }
});
