import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "@/api/lib/config";
import { decryptSecret, encryptSecret } from "@/api/lib/secrets";
import { accessToken, disconnectProvider, providerStatus, selectProvider, serverHostId } from "./provider-store";
let dir = "";
const original = { storage: config.STORAGE_DIR, key: config.INTEGRATIONS_KEY };
const file = (user: string) => join(dir, "assistant-private", `${createHash("sha256").update(user).digest("hex")}.enc`);
const tokens = { access_token: "old-access", refresh_token: "old-refresh", id_token: "saved-id-token", token_type: "Bearer", expires_in: 3600, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct" };
const seed = async (user: string, expired = false) => {
  const data = { provider: "chatgpt_subscription", active: "issued", registrations: [{ clientId: "issued", subject: "person", email: "person@example.test", expiresAt: expired ? 1 : Date.now() + 3600000, model: "allowed", tokens }] };
  await writeFile(file(user), encryptSecret(JSON.stringify(data), `assistant-provider:${user}`), { mode: 0o600 });
};
before(async () => { dir = await mkdtemp(join(tmpdir(), "wh-provider-test-")); config.STORAGE_DIR = join(dir,"files"); config.INTEGRATIONS_KEY = Buffer.alloc(32,7).toString("base64"); await mkdir(join(dir,"assistant-private")); });
after(async () => { mock.restoreAll(); config.STORAGE_DIR = original.storage; config.INTEGRATIONS_KEY = original.key; await rm(dir,{ recursive:true,force:true }); });
describe("private subscription credential lifecycle", () => {
  it("keeps account status separate per user and never returns tokens", async () => {
    await seed("alice"); const status = await providerStatus("alice");
    assert.equal(status.accountId,"issued"); assert.equal(status.connected,true);
    assert.ok(!JSON.stringify(status).includes("old-access")); assert.ok(!JSON.stringify(status).includes("old-refresh"));
    assert.equal((await providerStatus("bob")).accountId,null);
    assert.equal(await accessToken("alice"),"old-access");
  });
  it("serializes rotating refreshes and atomically saves the replacement", async () => {
    await seed("refresh",true); let calls = 0;
    const fetchMock = mock.method(globalThis,"fetch",async (url: unknown, init: RequestInit) => {
      assert.equal(url,"https://auth.openai.com/api/accounts/oauth/token");
      const params=init.body as URLSearchParams; assert.equal(params.get("client_id"),"issued"); assert.equal(params.get("resource"),"https://api.openai.com/v1"); assert.equal(params.has("scope"),false);
      calls++; await new Promise((done) => setTimeout(done,10));
      return new Response(JSON.stringify({ access_token:"new-access",refresh_token:"new-refresh",expires_in:3600 }));
    });
    try { assert.deepEqual(await Promise.all([accessToken("refresh"),accessToken("refresh"),accessToken("refresh")]),["new-access","new-access","new-access"]); assert.equal(calls,1); }
    finally { fetchMock.mock.restore(); }
    const sealed=await readFile(file("refresh"),"utf8"); assert.ok(!sealed.includes("new-access"));
    assert.ok(decryptSecret(sealed,"assistant-provider:refresh").includes("new-refresh"));
    assert.equal((await stat(file("refresh"))).mode & 0o777,0o600);
    assert.throws(() => decryptSecret(sealed,"assistant-provider:alice"));
  });
  it("clears terminal refresh failures while retaining the registered account", async () => {
    await seed("revoked",true);
    const fetchMock=mock.method(globalThis,"fetch",async () => new Response(JSON.stringify({error:"invalid_grant"}),{status:400}));
    try { await assert.rejects(accessToken("revoked")); } finally {fetchMock.mock.restore();}
    const status=await providerStatus("revoked"); assert.equal(status.connected,false); assert.equal(status.accountId,"issued"); assert.equal(status.provider,"chatgpt_subscription");
  });
  it("preserves credentials during temporary infrastructure failures", async () => {
    await seed("temporary",true);
    const fetchMock=mock.method(globalThis,"fetch",async () => new Response(JSON.stringify({error:"temporarily_unavailable"}),{status:503}));
    try {await assert.rejects(accessToken("temporary"));} finally {fetchMock.mock.restore();}
    assert.equal((await providerStatus("temporary")).connected,true);
  });
  it("uses only visible account models and refuses a hardcoded unavailable choice", async () => {
    await seed("models");
    const fetchMock=mock.method(globalThis,"fetch",async () => new Response(JSON.stringify({models:[{slug:"allowed",display_name:"Available model",visibility:"list"},{slug:"hidden",display_name:"Hidden",visibility:"hide"}]})));
    try {
      assert.deepEqual((await providerStatus("models",true)).models,[{slug:"allowed",displayName:"Available model"}]);
      await assert.rejects(selectProvider("models",{provider:"chatgpt_subscription",model:"invented"}));
      await selectProvider("models",{provider:"chatgpt_subscription",model:"allowed"});
    } finally {fetchMock.mock.restore();}
  });
  it("reports unconfirmed revocation, clears tokens and keeps the chosen provider", async () => {
    await seed("disconnect");
    const fetchMock=mock.method(globalThis,"fetch",async () => {throw new Error("offline");});
    try {assert.deepEqual(await disconnectProvider("disconnect"),{remoteRevoked:false});} finally {fetchMock.mock.restore();}
    const status=await providerStatus("disconnect"); assert.equal(status.connected,false); assert.equal(status.provider,"chatgpt_subscription"); assert.equal(status.accountId,"issued");
  });
  it("retains the VM's stable host identity",async () => { assert.equal(await serverHostId(),await serverHostId()); assert.match(await serverHostId(),/^urn:uuid:/); });
});
