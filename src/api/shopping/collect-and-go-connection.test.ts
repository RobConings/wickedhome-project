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
import { adoptCollectAndGoSession, disconnectCollectAndGoBrowser, importCollectAndGoSession, rememberedCollectAndGoOffer, searchCollectAndGo, setCollectAndGoAccess, setCollectAndGoBasket } from "./collect-and-go-browser";
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
function fakeBrowser(body = "Current products") {
  const options: unknown[] = [];
  const launch = mock.method(chromium, "launch", async () => ({
    close: async () => undefined,
    newContext: async (input: unknown) => {
      options.push(input);
      return {
        route: async () => undefined, storageState: async () => state,
        newPage: async () => ({ setDefaultTimeout: () => undefined, setDefaultNavigationTimeout: () => undefined, goto: async () => undefined, locator: (selector: string) => selector === "body" ? { innerText: async () => body } : { first: () => ({ waitFor: async () => undefined }), evaluateAll: async () => [{ name: "Milk", url: "https://www.collectandgo.be/nl/assortiment/milk", image: null, price: "€ 1,50", unitPrice: null, promotion: null }] } }),
      };
    },
  }));
  return { launch, options };
}
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
