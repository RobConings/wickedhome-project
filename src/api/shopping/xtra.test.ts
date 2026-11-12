import assert from "node:assert/strict";
import { after, afterEach, before, it, mock } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionUser } from "@/features/auth/types/auth";
import { xtraCredentialsSchema } from "@/features/shopping/types/xtra";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { decryptSecret } from "../lib/secrets";
import { XtraClient, parseXtraList } from "./xtra-client";
import { readXtraConnection } from "./xtra-store";
import { addXtra, checkXtra, connectXtra, disconnectXtra, listXtra, removeXtra, searchXtra, setXtraAccess, xtraAdditionPreview, xtraStatus } from "./xtra.service";

const user = (id: string, householdId = id, role: SessionUser["role"] = "owner"): SessionUser => ({ id, householdId, role, email: `${id}@example.test`, name: id, locale: "en", householdName: "Home", habitantId: null });
const credentials = { sessionId: "private-session", apiKey: "private-api-key", placeId: "1234" };
const signal = () => new AbortController().signal;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const remoteProduct = { technicalArticleNumber: "123456", commercialArticleNumber: "789", name: "Milk", brand: "BONI", content: "1 l", OrderUnit: "P", GTIN: ["05449000000996"], thumbNail: "https://static.colruytgroup.com/images/milk.jpg", price: { basicPrice: 1.29 } };
let directory = "";
const original = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY };
const restored: (() => void)[] = [];
function replace(target: object, key: string, implementation: unknown) { const previous = Reflect.get(target, key); Reflect.set(target, key, implementation); restored.push(() => Reflect.set(target, key, previous)); }
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "wickedhome-xtra-"));
  config.STORAGE_DIR = join(directory, "files"); config.INTEGRATIONS_KEY = Buffer.alloc(32, 8).toString("base64");
  replace(db.user, "findMany", async ({ where }: { where: { householdId: string } }) => [where.householdId, `${where.householdId}-wife`, `${where.householdId}-child`].map((id) => ({ id, email: `${id}@example.test`, role: id.endsWith("-child") ? "CHILD" : id.endsWith("-wife") ? "ADULT" : "OWNER", habitant: { name: id } })));
  replace(db.product, "findMany", async () => []);
  replace(db.auditEntry, "create", async () => ({}));
});
afterEach(() => mock.restoreAll());
after(async () => { for (const restore of restored.reverse()) restore(); config.STORAGE_DIR = original.storage; config.INTEGRATIONS_KEY = original.key; await rm(directory, { recursive: true, force: true }); });
function upstream() {
  const items: { id: string; description: string; productData: { productId: string; quantity: number; unitCode: string }; completedAt: null }[] = [];
  let writes = 0;
  const fetch = mock.method(globalThis, "fetch", async (target: unknown, init?: RequestInit) => {
    const url = new URL(String(target));
    assert.ok(["apix.colruyt.be", "apip.colruyt.be"].includes(url.hostname));
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>)["x-cg-apikey"], credentials.apiKey);
    if (url.pathname.endsWith("product-search-prs")) return json({ products: [remoteProduct] });
    if (url.pathname.endsWith("add-items-to-list")) { writes++; const body = JSON.parse(String(init?.body)); items.push(body.items[0]); return json({ data: { items } }, 201); }
    if (init?.method === "DELETE") { writes++; const index = items.findIndex((item) => item.id === url.pathname.split("/").at(-1)); if (index >= 0) items.splice(index, 1); return new Response(null, { status: 204 }); }
    return json({ getListItems: { data: items } });
  });
  return { items, fetch, writes: () => writes };
}

it("rejects header injection, arbitrary stores and full cookie headers", () => {
  for (const changed of [{ sessionId: "abc\r\nInjected: yes" }, { apiKey: "key; cookie=other" }, { placeId: "https://other.test" }, { userAgent: "browser\r\nInjected: yes" }]) assert.equal(xtraCredentialsSchema.safeParse({ ...credentials, ...changed }).success, false);
});
it("recognizes explicit empty list envelopes but refuses error-shaped success responses", () => {
  assert.deepEqual(parseXtraList({ items: [] }), []);
  assert.deepEqual(parseXtraList({ getListItems: { data: [] } }), []);
  assert.throws(() => parseXtraList({ error: "not signed in" }));
});
it("stores one encrypted household connection and grants the wife's account access without credentials in status", async () => {
  upstream(); const owner = user("sharing");
  await connectXtra(owner, { credentials, userIds: [owner.id, "sharing-wife"] }, signal());
  assert.equal((await xtraStatus(user("sharing-wife", "sharing", "adult"))).canUse, true);
  assert.equal((await xtraStatus(user("sharing-child", "sharing", "child"))).canUse, false);
  const status = await xtraStatus(owner);
  assert.ok(!JSON.stringify(status).includes("private-session"));
  assert.ok(!JSON.stringify(status).includes("private-api-key"));
  const file = join(directory, "xtra-private", `${createHash("sha256").update("sharing").digest("hex")}.enc`);
  const sealed = await readFile(file, "utf8");
  assert.ok(!sealed.includes(credentials.sessionId));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, "xtra-private"))).mode & 0o777, 0o700);
  assert.throws(() => decryptSecret(sealed, "xtra:other-household"));
});
it("refuses non-owner management and grants to another household before calling Colruyt", async () => {
  const remote = upstream();
  await assert.rejects(connectXtra(user("adult", "other", "adult"), { credentials, userIds: [] }, signal()), /Only household owners/);
  await assert.rejects(connectXtra(user("scoped"), { credentials, userIds: ["foreign"] }, signal()), /this household/);
  assert.equal(remote.fetch.mock.callCount(), 0);
});
it("uses the same shared credentials for product search, preserves store pricing and normalizes GTIN", async () => {
  upstream(); const owner = user("search");
  await connectXtra(owner, { credentials, userIds: [owner.id, "search-wife"] }, signal());
  const result = await searchXtra(user("search-wife", "search", "adult"), { query: "milk" }, signal());
  assert.equal(result.placeId, "1234"); assert.equal(result.products[0]?.priceCents, 129);
  assert.equal(result.products[0]?.barcode, "5449000000996"); assert.equal(result.products[0]?.productId, "123456");
  assert.equal(result.products[0]?.url, "https://www.colruyt.be/nl/producten/789");
  assert.ok(!JSON.stringify(result).includes(credentials.sessionId));
});
it("revokes UI search and already-prepared MCP offers immediately after access is saved", async () => {
  const remote = upstream(); const owner = user("revoke"), wife = user("revoke-wife", "revoke", "adult");
  await connectXtra(owner, { credentials, userIds: [wife.id] }, signal());
  const result = await searchXtra(wife, { query: "milk" }, signal());
  await setXtraAccess(owner, []);
  const count = remote.fetch.mock.callCount();
  await assert.rejects(searchXtra(wife, { query: "milk" }, signal()), /don't have access/);
  await assert.rejects(xtraAdditionPreview(wife, result.products[0]!.offer), /don't have access/);
  await assert.rejects(addXtra(wife, { offer: result.products[0]!.offer, quantity: 1, operationId: randomUUID() }, signal()), /don't have access/);
  assert.equal(remote.fetch.mock.callCount(), count);
});
it("isolates observed offers between accounts and households", async () => {
  upstream(); const owner = user("isolation"), wife = user("isolation-wife", "isolation", "adult");
  await connectXtra(owner, { credentials, userIds: [owner.id, wife.id] }, signal());
  const result = await searchXtra(owner, { query: "milk" }, signal());
  await assert.rejects(addXtra(wife, { offer: result.products[0]!.offer, quantity: 2, operationId: randomUUID() }, signal()), /Search for the product again/);
  await assert.rejects(searchXtra(user("other-household"), { query: "milk" }, signal()), /don't have access/);
});
it("adds only observed whole-piece products and persists idempotency across retries", async () => {
  const remote = upstream(); const owner = user("idempotent");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const result = await searchXtra(owner, { query: "milk" }, signal());
  const input = { offer: result.products[0]!.offer, quantity: 3, operationId: randomUUID() };
  const first = await addXtra(owner, input, signal());
  assert.equal(first.quantity, 3); assert.equal(remote.writes(), 1);
  assert.deepEqual(await addXtra(owner, input, signal()), first);
  assert.equal(remote.writes(), 1);
  await assert.rejects(addXtra(owner, { ...input, quantity: 4 }, signal()), /different change/);
});
it("records an uncertain write before dispatch and refuses blind replay after a lost response", async () => {
  upstream(); const owner = user("uncertain");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const result = await searchXtra(owner, { query: "milk" }, signal());
  const input = { offer: result.products[0]!.offer, quantity: 1, operationId: randomUUID() };
  mock.restoreAll(); let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; throw new Error("request lost private-session"); });
  await assert.rejects(addXtra(owner, input, signal()), /may already have happened/);
  await assert.rejects(addXtra(owner, input, signal()), /may already have happened/);
  assert.equal(calls, 1);
  assert.equal((await readXtraConnection(owner.householdId))?.operations[0]?.state, "uncertain");
});
it("allows selected children to read but never change the shared list", async () => {
  const remote = upstream(); const owner = user("child"), child = user("child-child", "child", "child");
  await connectXtra(owner, { credentials, userIds: [child.id] }, signal());
  const result = await searchXtra(child, { query: "milk" }, signal());
  await listXtra(child, {}, signal());
  await assert.rejects(addXtra(child, { offer: result.products[0]!.offer, quantity: 1, operationId: randomUUID() }, signal()), /Children/);
  assert.equal(remote.writes(), 0);
});
it("requires reading the exact list item before removal and verifies it is absent afterward", async () => {
  const remote = upstream(); const owner = user("remove"), id = randomUUID();
  remote.items.push({ id, description: "Milk", productData: { productId: "123456", quantity: 2, unitCode: "P" }, completedAt: null });
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const input = { itemId: id, operationId: randomUUID() };
  await assert.rejects(removeXtra(owner, input, signal()), /Read the Xtra shopping list/);
  await listXtra(owner, {}, signal());
  await removeXtra(owner, input, signal()); await removeXtra(owner, input, signal());
  assert.equal(remote.writes(), 1); assert.equal(remote.items.length, 0);
});
it("marks expired or challenged sessions for reconnect and stops repeated background calls", async () => {
  upstream(); const owner = user("expired");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  mock.restoreAll(); const fetch = mock.method(globalThis, "fetch", async () => new Response("private response", { status: 403 }));
  await assert.rejects(searchXtra(owner, { query: "milk" }, signal()), /new login/);
  assert.equal((await xtraStatus(owner)).needsReconnect, true);
  await assert.rejects(listXtra(owner, {}, signal()), /needs a new login/);
  assert.equal(fetch.mock.callCount(), 1);
});
it("keeps a working connection when replacement credentials fail verification", async () => {
  upstream(); const owner = user("replacement");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const revision = (await readXtraConnection(owner.householdId))?.revision;
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  await assert.rejects(connectXtra(owner, { credentials: { ...credentials, sessionId: "bad" }, userIds: [] }, signal()));
  assert.equal((await readXtraConnection(owner.householdId))?.revision, revision);
  assert.equal((await xtraStatus(owner)).canUse, true);
});
it("disconnects all permitted accounts together", async () => {
  upstream(); const owner = user("disconnect"), wife = user("disconnect-wife", "disconnect", "adult");
  await connectXtra(owner, { credentials, userIds: [wife.id] }, signal());
  await checkXtra(owner, signal()); await disconnectXtra(owner);
  assert.equal((await xtraStatus(wife)).canUse, false);
  await assert.rejects(listXtra(wife, {}, signal()), /don't have access/);
});
it("never follows credential-bearing redirects or treats HTML as an empty list", async () => {
  const fetch = mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => { assert.equal(init?.redirect, "error"); return new Response("<html>sign in</html>", { headers: { "Content-Type": "text/html" } }); });
  await assert.rejects(new XtraClient(credentials, signal()).list(10, 0), /login or verification/);
  assert.equal(fetch.mock.callCount(), 1);
});
it("refuses weighted products instead of guessing a unit or submitting a mutation", async () => {
  const remote = upstream(); const owner = user("weighted");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const originalUnit = remoteProduct.OrderUnit;
  try {
    remoteProduct.OrderUnit = "K";
    const result = await searchXtra(owner, { query: "apples" }, signal());
    await assert.rejects(addXtra(owner, { offer: result.products[0]!.offer, quantity: 2, operationId: randomUUID() }, signal()), /isn't sold in whole pieces/);
    assert.equal(remote.writes(), 0);
  } finally { remoteProduct.OrderUnit = originalUnit; }
});
it("returns an existing catalogue match using a normalized GTIN or the retailer reference", async () => {
  upstream(); const owner = user("duplicate");
  const old = Reflect.get(db.product, "findMany");
  Reflect.set(db.product, "findMany", async () => [{ id: "existing", name: "Our milk", barcode: "05449000000996", colruytProductId: null }]);
  try {
    await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
    const result = await searchXtra(owner, { query: "milk" }, signal());
    assert.deepEqual(result.products[0]!.existingProduct, { id: "existing", name: "Our milk" });
  } finally { Reflect.set(db.product, "findMany", old); }
});
it("does not contact the retailer for an already-cancelled request", async () => {
  const remote = upstream(), owner = user("cancel");
  await connectXtra(owner, { credentials, userIds: [owner.id] }, signal());
  const before = remote.fetch.mock.callCount();
  await assert.rejects(searchXtra(owner, { query: "milk" }, AbortSignal.abort()));
  assert.equal(remote.fetch.mock.callCount(), before);
});
