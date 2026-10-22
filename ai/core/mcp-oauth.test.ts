/**
 * OAuth 2.1 for the MCP server (ai/docs/MCP-OAUTH.md): discovery, dynamic registration and its allow-list,
 * authorize validation, consent (CSRF, children, households), the code (single use, replay revokes, PKCE),
 * refresh rotation with reuse detection, expiry and revocation, scopes over MCP, and the personal tokens next
 * to it. In-process Express with an in-memory store and a fake clock; no database:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/mcp-oauth.test.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { z } from "zod";
import type { McpConnectedApp, McpOAuthConsent, McpOAuthSettings } from "@/features/assistant/types/mcp-oauth";
import { errorHandler } from "@/api/lib/http";
import type { TokenIdentity } from "./assistant.service";
import {
  DEFAULT_OAUTH_SETTINGS,
  createMcpOAuth,
  oauthUrls,
  parseScopes,
  pkceChallenge,
  verifyPkce,
  type ClientRecord,
  type CodeRecord,
  type GrantRecord,
  type OAuthStore,
  type RequestRecord,
  type StoredUser,
  type TokenRecord,
} from "./mcp-oauth";
import { createMcpOAuthRoutes } from "./mcp-oauth.routes";
import { createMcpAuthenticator, createMcpRouter } from "./mcp.routes";
import { registerAssistantTool, unregisterAssistantTool } from "./tools";

// ── In-memory store ───────────────────────────────────────────────────────────────────────────────────

function memoryStore(users: Map<string, StoredUser>) {
  let settings: McpOAuthSettings = { ...DEFAULT_OAUTH_SETTINGS, allowedHosts: [...DEFAULT_OAUTH_SETTINGS.allowedHosts] };
  const clients = new Map<string, ClientRecord>();
  const requests = new Map<string, RequestRecord>();
  const codes = new Map<string, CodeRecord>();
  const grants = new Map<string, GrantRecord>();
  const tokens = new Map<string, TokenRecord>();
  let seq = 0;
  const id = () => `id${++seq}`;
  const live = (grant: GrantRecord, now: Date) =>
    !grant.revokedAt && [...tokens.values()].some((t) => t.grantId === grant.id && t.kind === "refresh" && !t.usedAt && !t.revokedAt && t.expiresAt > now);

  const store: OAuthStore = {
    readSettings: async () => ({ ...settings, allowedHosts: [...settings.allowedHosts] }),
    writeSettings: async (next) => {
      settings = { ...next };
    },
    createClient: async ({ createdById: _createdById, ...client }) => {
      const record: ClientRecord = { ...client, id: id(), createdAt: new Date(clock), lastUsedAt: null };
      clients.set(record.id, record);
      return record;
    },
    findClient: async (clientId) => [...clients.values()].find((c) => c.clientId === clientId) ?? null,
    findClientById: async (key) => clients.get(key) ?? null,
    listManualClients: async (householdId) => [...clients.values()].filter((c) => c.kind === "manual" && c.householdId === householdId),
    deleteManualClient: async (key, householdId) => {
      const client = clients.get(key);
      if (!client || client.kind !== "manual" || client.householdId !== householdId) return false;
      clients.delete(key);
      return true;
    },
    touchClient: async (key, at) => {
      const client = clients.get(key);
      if (client) client.lastUsedAt = at;
    },
    createRequest: async (request) => {
      requests.set(request.id, { ...request });
    },
    findRequest: async (key) => requests.get(key) ?? null,
    claimRequest: async (key, userId, csrfHash) => {
      const request = requests.get(key);
      if (!request || (request.userId && request.userId !== userId)) return false;
      Object.assign(request, { userId, csrfHash });
      return true;
    },
    deleteRequest: async (key) => requests.delete(key),
    createCode: async (code) => {
      const record = { ...code, id: id(), usedAt: null, grantId: null };
      codes.set(record.id, record);
    },
    findCode: async (hash) => [...codes.values()].find((c) => c.codeHash === hash) ?? null,
    consumeCode: async (key, at) => {
      const code = codes.get(key);
      if (!code || code.usedAt) return false;
      code.usedAt = at;
      return true;
    },
    linkCodeToGrant: async (key, grantId) => {
      const code = codes.get(key);
      if (code) code.grantId = grantId;
    },
    createGrant: async (grant) => {
      const record: GrantRecord = { ...grant, id: id(), lastUsedAt: null, revokedAt: null, createdAt: new Date(clock) };
      grants.set(record.id, record);
      return record;
    },
    findGrant: async (key) => grants.get(key) ?? null,
    revokeGrant: async (key, at) => {
      const grant = grants.get(key);
      if (!grant || grant.revokedAt) return false;
      grant.revokedAt = at;
      return true;
    },
    touchGrant: async (key, at) => {
      const grant = grants.get(key);
      if (grant) grant.lastUsedAt = at;
    },
    listActiveGrants: async (householdId, userId, now) =>
      [...grants.values()]
        .filter((g) => g.householdId === householdId && (!userId || g.userId === userId) && live(g, now))
        .map(
          (g): McpConnectedApp => ({
            id: g.id,
            clientName: clients.get(g.clientId)?.name ?? "",
            redirectHost: new URL(clients.get(g.clientId)?.redirectUris[0] ?? "https://x").hostname,
            kind: clients.get(g.clientId)?.kind ?? "dynamic",
            scope: g.scope,
            userId: g.userId,
            person: users.get(g.userId)?.name ?? "",
            lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
            createdAt: g.createdAt.toISOString(),
          }),
        ),
    createToken: async (token) => {
      const record = { ...token, id: id(), usedAt: null, revokedAt: null };
      tokens.set(record.id, record);
    },
    findToken: async (hash) => [...tokens.values()].find((t) => t.tokenHash === hash) ?? null,
    useToken: async (key, at) => {
      const token = tokens.get(key);
      if (!token || token.usedAt) return false;
      token.usedAt = at;
      return true;
    },
    revokeToken: async (key, at) => {
      const token = tokens.get(key);
      if (token && !token.revokedAt) token.revokedAt = at;
    },
    findUser: async (key) => users.get(key) ?? null,
    cleanup: async (now, idleBefore) => {
      let removed = 0;
      for (const client of [...clients.values()]) {
        const idle = (client.lastUsedAt ?? client.createdAt) < idleBefore;
        const hasLive = [...grants.values()].some((g) => g.clientId === client.id && live(g, now));
        if (client.kind === "dynamic" && idle && !hasLive) {
          clients.delete(client.id);
          removed++;
        }
      }
      return { clients: removed, grants: 0, tokens: 0 };
    },
  };
  return { store, clients, grants };
}

// ── Fixture ───────────────────────────────────────────────────────────────────────────────────────────

let clock = Date.parse("2026-10-11T10:00:00.000Z");
const user = (id: string, role: StoredUser["role"], householdId = "h1"): StoredUser => ({
  id,
  email: `${id}@example.com`,
  name: id[0]!.toUpperCase() + id.slice(1),
  role,
  locale: "en",
  householdId,
  householdName: householdId === "h1" ? "Home" : "Other",
  habitantId: null,
  disabled: false,
});
const users = new Map<string, StoredUser>();
const resetUsers = () => {
  users.clear();
  for (const u of [user("rob", "owner"), user("clara", "adult"), user("kid", "child"), user("eve", "owner", "h2")]) users.set(u.id, u);
};
resetUsers();

const ISSUER = "https://home.example.be";
const urls = oauthUrls(ISSUER);
const RESOURCE = `${ISSUER}/api/mcp`;
const CALLBACK = "https://chatgpt.com/connector/oauth/abc123";

const memory = memoryStore(users);
const oauth = createMcpOAuth({ store: memory.store, urls, now: () => new Date(clock) });
const noAudit = async () => {};
const routes = createMcpOAuthRoutes(oauth, { record: noAudit, limits: { registerPerIp: 10_000, registerGlobal: 10_000, tokenPerIp: 10_000, authorizePerIp: 10_000 } });
const strictRoutes = createMcpOAuthRoutes(oauth, { record: noAudit, limits: { registerPerIp: 2, registerGlobal: 100, tokenPerIp: 120, authorizePerIp: 60 } });

/** Personal `wh_mcp_` tokens: a fake of the real lookup (that one needs the database). */
const personalTokens = new Map<string, TokenIdentity>([
  ["wh_mcp_personal", { tokenId: "t1", tokenName: "Claude Desktop", scope: "read", user: (({ disabled: _d, ...rest }) => rest)(user("rob", "owner")) }],
]);
const authenticate = createMcpAuthenticator(async (token) => personalTokens.get(token) ?? null, oauth);

const tools = [
  registerAssistantTool({
    name: "oauthtest.read",
    description: "Read something.",
    input: z.object({}),
    permission: "read",
    confirm: "never",
    activity: { en: "Read", nl: "Gelezen" },
    run: (ctx) => ({ hello: ctx.user.name, via: ctx.via ?? null }),
  }),
  registerAssistantTool({
    name: "oauthtest.add",
    description: "Add something.",
    input: z.object({ name: z.string().min(1) }),
    permission: "write",
    confirm: "first-time",
    activity: { en: "Added", nl: "Toegevoegd" },
    describe: (_ctx, input) => `Add ${input.name}`,
    run: (_ctx, input) => ({ added: input.name }),
  }),
];

let base = "";
const server = (() => {
  const app = express();
  app.use("/.well-known", routes.wellKnownRouter);
  app.use("/oauth", routes.oauthRouter);
  app.use("/strict/oauth", strictRoutes.oauthRouter);
  app.use(
    "/api/assistant/oauth",
    express.json(),
    (req, _res, next) => {
      const found = users.get(req.get("x-test-user") ?? "");
      if (found) req.user = (({ disabled: _d, ...rest }) => rest)(found);
      next();
    },
    routes.manageRouter,
  );
  app.use("/api/mcp", createMcpRouter({ authenticate, resourceMetadataUrl: urls.resourceMetadata }));
  app.use(errorHandler);
  return app.listen(0);
})();

before(() => {
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  tools.forEach((tool) => unregisterAssistantTool(tool.name));
});
beforeEach(async () => {
  resetUsers();
  await memory.store.writeSettings({ ...DEFAULT_OAUTH_SETTINGS, allowedHosts: [...DEFAULT_OAUTH_SETTINGS.allowedHosts] });
});

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────────────

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;
const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
const register = (body: unknown, prefix = "") =>
  fetch(`${base}${prefix}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const app = (path: string, as: string, init: RequestInit = {}) =>
  fetch(`${base}/api/assistant/oauth${path}`, { ...init, headers: { "Content-Type": "application/json", "x-test-user": as, ...(init.headers ?? {}) } });

async function publicClient(): Promise<string> {
  const response = await register({ client_name: "ChatGPT", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
  assert.equal(response.status, 201);
  return (await json(response)).client_id as string;
}

const verifierOf = () => randomBytes(32).toString("base64url");

function authorizeUrl(clientId: string, params: Record<string, string | null> = {}, verifier = "x".repeat(43)) {
  const query: Record<string, string | null> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    state: "st4te",
    scope: "read write",
    resource: RESOURCE,
    ...params,
  };
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== null));
  return `${base}/oauth/authorize?${search}`;
}

/** Authorize → consent (as `as`) → allow with `scope` → the code. */
async function getCode(clientId: string, verifier: string, { as = "rob", scope = "write" }: { as?: string; scope?: "read" | "write" } = {}) {
  const started = await fetch(authorizeUrl(clientId, {}, verifier), { redirect: "manual" });
  assert.equal(started.status, 302);
  const requestId = started.headers.get("location")!.replace("/connect/", "");
  const consent = (await (await app(`/requests/${requestId}`, as)).json()) as McpOAuthConsent;
  const decided = await app(`/requests/${requestId}`, as, { method: "POST", body: JSON.stringify({ decision: "allow", scope, csrf: consent.csrf }) });
  assert.equal(decided.status, 200);
  const redirectTo = new URL(((await decided.json()) as { redirectTo: string }).redirectTo);
  return redirectTo.searchParams.get("code")!;
}

const exchange = (clientId: string, code: string, verifier: string, extra: Record<string, string> = {}) =>
  form("/oauth/token", { grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: CALLBACK, resource: RESOURCE, ...extra });

async function connect(as = "rob", scope: "read" | "write" = "write") {
  const clientId = await publicClient();
  const verifier = verifierOf();
  const response = await exchange(clientId, await getCode(clientId, verifier, { as, scope }), verifier);
  assert.equal(response.status, 200);
  const body = await json(response);
  return { clientId, access: body.access_token as string, refresh: body.refresh_token as string, body };
}

const mcp = (token: string, method: string, params?: Record<string, unknown>) =>
  fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────────

describe("OAuth helpers", () => {
  it("verifies PKCE S256 only for the right verifier", () => {
    const verifier = verifierOf();
    assert.equal(verifyPkce(verifier, pkceChallenge(verifier)), true);
    assert.equal(verifyPkce(verifierOf(), pkceChallenge(verifier)), false);
    assert.equal(verifyPkce("short", pkceChallenge("short")), false);
    // RFC 7636 appendix B test vector.
    assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("reads scopes: nothing or write offers both, unknown is refused", () => {
    assert.deepEqual(parseScopes(undefined), ["read", "write"]);
    assert.deepEqual(parseScopes("write"), ["read", "write"]);
    assert.deepEqual(parseScopes("read"), ["read"]);
    assert.equal(parseScopes("read admin"), null);
  });
});

describe("discovery", () => {
  it("serves the protected resource metadata at both paths", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      const body = await json(response);
      assert.equal(body.resource, RESOURCE);
      assert.deepEqual(body.authorization_servers, [ISSUER]);
      assert.deepEqual(body.scopes_supported, ["read", "write"]);
      assert.deepEqual(body.bearer_methods_supported, ["header"]);
    }
  });

  it("serves the authorization server metadata, with registration only while DCR is on", async () => {
    const on = await json(await fetch(`${base}/.well-known/oauth-authorization-server`));
    assert.equal(on.issuer, ISSUER);
    assert.equal(on.authorization_endpoint, `${ISSUER}/oauth/authorize`);
    assert.equal(on.token_endpoint, `${ISSUER}/oauth/token`);
    assert.equal(on.registration_endpoint, `${ISSUER}/oauth/register`);
    assert.equal(on.revocation_endpoint, `${ISSUER}/oauth/revoke`);
    assert.deepEqual(on.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(on.grant_types_supported, ["authorization_code", "refresh_token"]);
    assert.deepEqual(on.response_types_supported, ["code"]);
    assert.deepEqual(on.token_endpoint_auth_methods_supported, ["none", "client_secret_post", "client_secret_basic"]);
    assert.deepEqual(on.scopes_supported, ["read", "write"]);
    await memory.store.writeSettings({ dcrEnabled: false, allowedHosts: ["chatgpt.com"] });
    const off = await json(await fetch(`${base}/.well-known/oauth-authorization-server`));
    assert.equal("registration_endpoint" in off, false);
  });

  it("answers other well-known documents with a JSON 404", async () => {
    const response = await fetch(`${base}/.well-known/openid-configuration`);
    assert.equal(response.status, 404);
    assert.equal((await json(response)).error, "not_found");
  });

  it("points to the metadata from the MCP 401", async () => {
    const response = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
    const header = response.headers.get("www-authenticate") ?? "";
    assert.match(header, /^Bearer /);
    assert.match(header, new RegExp(`resource_metadata="${ISSUER}/\\.well-known/oauth-protected-resource"`));
    const bad = await mcp("wh_at_nonsense", "ping");
    assert.match(bad.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
  });
});

describe("dynamic client registration", () => {
  it("registers allow-listed https redirect URIs; public or confidential", async () => {
    const publicResponse = await register({ client_name: "ChatGPT", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    assert.equal(publicResponse.status, 201);
    const pub = await json(publicResponse);
    assert.match(pub.client_id as string, /^wh_client_/);
    assert.equal("client_secret" in pub, false);
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    // RFC 7591's default auth method is client_secret_basic: a secret, once.
    const confidential = await json(await register({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }));
    assert.match(confidential.client_secret as string, /^wh_cs_/);
    assert.equal(confidential.token_endpoint_auth_method, "client_secret_basic");
    assert.equal(confidential.client_name, "MCP client");
  });

  it("rejects redirect URIs outside the allow-list with invalid_redirect_uri", async () => {
    for (const uri of ["https://evil.example/cb", "http://chatgpt.com/cb", "https://chatgpt.com.evil.example/cb", "https://chatgpt.com:8443/cb", "https://user@chatgpt.com/cb", "https://chatgpt.com/cb#x", "not a url"]) {
      const response = await register({ redirect_uris: [uri], token_endpoint_auth_method: "none" });
      assert.equal(response.status, 400, uri);
      assert.equal((await json(response)).error, "invalid_redirect_uri", uri);
    }
    const none = await register({ redirect_uris: [] });
    assert.equal((await json(none)).error, "invalid_redirect_uri");
    const badMethod = await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "private_key_jwt" });
    assert.equal((await json(badMethod)).error, "invalid_client_metadata");
  });

  it("follows the owner's allow-list", async () => {
    await memory.store.writeSettings({ dcrEnabled: true, allowedHosts: ["claude.ai"] });
    assert.equal((await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" })).status, 400);
  });

  it("hides the endpoint while DCR is off, but registered clients keep working", async () => {
    const clientId = await publicClient();
    await memory.store.writeSettings({ dcrEnabled: false, allowedHosts: ["chatgpt.com"] });
    const response = await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    assert.equal(response.status, 404);
    const verifier = verifierOf();
    const token = await exchange(clientId, await getCode(clientId, verifier), verifier);
    assert.equal(token.status, 200);
  });

  it("rate-limits registrations per IP", async () => {
    const body = { redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" };
    assert.equal((await register(body, "/strict")).status, 201);
    assert.equal((await register(body, "/strict")).status, 201);
    const third = await register(body, "/strict");
    assert.equal(third.status, 429);
    assert.equal((await json(third)).error, "temporarily_unavailable");
  });

  it("deletes idle dynamic clients without a live grant", async () => {
    const idle = await publicClient();
    const { clientId: used } = await connect();
    clock += 61 * 60_000;
    await oauth.cleanup();
    assert.equal(await memory.store.findClient(idle), null);
    assert.ok(await memory.store.findClient(used));
  });
});

describe("authorize", () => {
  it("shows a page (never redirects) for an unknown client or a redirect URI that isn't registered", async () => {
    const clientId = await publicClient();
    const unknown = await fetch(authorizeUrl("wh_client_nope"), { redirect: "manual" });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.headers.get("location"), null);
    const bad = await fetch(authorizeUrl(clientId, { redirect_uri: "https://chatgpt.com/connector/oauth/other" }), { redirect: "manual" });
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get("location"), null);
    assert.match(bad.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  });

  it("stops a redirect URI whose host was removed from the allow-list", async () => {
    const clientId = await publicClient();
    await memory.store.writeSettings({ dcrEnabled: true, allowedHosts: ["claude.ai"] });
    assert.equal((await fetch(authorizeUrl(clientId), { redirect: "manual" })).status, 400);
  });

  it("sends errors back to the client: missing PKCE, plain method, wrong resource, response type, scope", async () => {
    const clientId = await publicClient();
    const cases: [Record<string, string | null>, string][] = [
      [{ code_challenge: null }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge_method: null }, "invalid_request"],
      [{ resource: "https://evil.example/api/mcp" }, "invalid_target"],
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ scope: "admin" }, "invalid_scope"],
    ];
    for (const [params, error] of cases) {
      const response = await fetch(authorizeUrl(clientId, params), { redirect: "manual" });
      assert.equal(response.status, 302, JSON.stringify(params));
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.origin + location.pathname, CALLBACK);
      assert.equal(location.searchParams.get("error"), error, JSON.stringify(params));
      assert.equal(location.searchParams.get("state"), "st4te");
      assert.equal(location.searchParams.get("iss"), ISSUER);
    }
  });

  it("sends a valid request to the consent page", async () => {
    const response = await fetch(authorizeUrl(await publicClient()), { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") ?? "", /^\/connect\/[A-Za-z0-9_-]{43}$/);
  });
});

describe("consent", () => {
  async function pending(clientId?: string) {
    const response = await fetch(authorizeUrl(clientId ?? (await publicClient())), { redirect: "manual" });
    return response.headers.get("location")!.replace("/connect/", "");
  }

  it("shows the client, the redirect host and the requested scopes", async () => {
    const consent = (await (await app(`/requests/${await pending()}`, "clara")).json()) as McpOAuthConsent;
    assert.equal(consent.clientName, "ChatGPT");
    assert.equal(consent.redirectHost, "chatgpt.com");
    assert.deepEqual(consent.requestedScopes, ["read", "write"]);
    assert.equal(consent.refused, null);
  });

  it("needs the page's CSRF token and the same person", async () => {
    const id = await pending();
    await app(`/requests/${id}`, "rob");
    const forged = await app(`/requests/${id}`, "rob", { method: "POST", body: JSON.stringify({ decision: "allow", scope: "read", csrf: "guess" }) });
    assert.equal(forged.status, 403);
    // Someone else can't take over a request another person opened.
    assert.equal((await app(`/requests/${id}`, "clara")).status, 404);
  });

  it("refuses children outright", async () => {
    const id = await pending();
    const consent = (await (await app(`/requests/${id}`, "kid")).json()) as McpOAuthConsent;
    assert.equal(consent.refused, "child");
    const allowed = await app(`/requests/${id}`, "kid", { method: "POST", body: JSON.stringify({ decision: "allow", scope: "read", csrf: consent.csrf }) });
    assert.equal(allowed.status, 403);
  });

  it("denies with access_denied and the state", async () => {
    const id = await pending();
    const consent = (await (await app(`/requests/${id}`, "rob")).json()) as McpOAuthConsent;
    const denied = await app(`/requests/${id}`, "rob", { method: "POST", body: JSON.stringify({ decision: "deny", csrf: consent.csrf }) });
    const redirectTo = new URL(((await denied.json()) as { redirectTo: string }).redirectTo);
    assert.equal(redirectTo.searchParams.get("error"), "access_denied");
    assert.equal(redirectTo.searchParams.get("state"), "st4te");
    assert.equal(redirectTo.searchParams.get("code"), null);
  });

  it("only grants what was requested, and a request only once", async () => {
    const clientId = await publicClient();
    const response = await fetch(authorizeUrl(clientId, { scope: "read" }), { redirect: "manual" });
    const id = response.headers.get("location")!.replace("/connect/", "");
    const consent = (await (await app(`/requests/${id}`, "rob")).json()) as McpOAuthConsent;
    assert.deepEqual(consent.requestedScopes, ["read"]);
    const write = await app(`/requests/${id}`, "rob", { method: "POST", body: JSON.stringify({ decision: "allow", scope: "write", csrf: consent.csrf }) });
    assert.equal(write.status, 400);
    const read = await app(`/requests/${id}`, "rob", { method: "POST", body: JSON.stringify({ decision: "allow", scope: "read", csrf: consent.csrf }) });
    assert.equal(read.status, 200);
    const again = await app(`/requests/${id}`, "rob", { method: "POST", body: JSON.stringify({ decision: "allow", scope: "read", csrf: consent.csrf }) });
    assert.equal(again.status, 404);
  });

  it("expires after 10 minutes", async () => {
    const id = await pending();
    clock += 11 * 60_000;
    assert.equal((await app(`/requests/${id}`, "rob")).status, 404);
  });
});

describe("token", () => {
  it("exchanges a code once; a replay revokes the whole grant", async () => {
    const clientId = await publicClient();
    const verifier = verifierOf();
    const code = await getCode(clientId, verifier);
    const first = await exchange(clientId, code, verifier);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const tokens = await json(first);
    assert.equal(tokens.token_type, "Bearer");
    assert.equal(tokens.expires_in, 3600);
    assert.equal(tokens.scope, "read write");
    assert.match(tokens.access_token as string, /^wh_at_/);
    assert.match(tokens.refresh_token as string, /^wh_rt_/);
    assert.equal((await mcp(tokens.access_token as string, "ping")).status, 200);

    const replay = await exchange(clientId, code, verifier);
    assert.equal(replay.status, 400);
    assert.equal((await json(replay)).error, "invalid_grant");
    assert.equal((await mcp(tokens.access_token as string, "ping")).status, 401);
    const refreshed = await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token as string });
    assert.equal((await json(refreshed)).error, "invalid_grant");
  });

  it("fails on a PKCE mismatch, and the code is spent", async () => {
    const clientId = await publicClient();
    const verifier = verifierOf();
    const code = await getCode(clientId, verifier);
    const wrong = await exchange(clientId, code, verifierOf());
    assert.equal(wrong.status, 400);
    assert.equal((await json(wrong)).error, "invalid_grant");
    assert.equal((await exchange(clientId, code, verifier)).status, 400);
  });

  it("binds the code to client, redirect URI, resource and 60 seconds", async () => {
    const clientId = await publicClient();
    const other = await publicClient();
    const verifier = verifierOf();
    const code = await getCode(clientId, verifier);
    // Another client can't use it (and doesn't spend it).
    assert.equal((await json(await exchange(other, code, verifier))).error, "invalid_grant");
    assert.equal((await json(await exchange(clientId, code, verifier, { resource: "https://evil.example/api/mcp" }))).error, "invalid_target");

    const late = await getCode(clientId, verifier);
    clock += 61_000;
    assert.equal((await json(await exchange(clientId, late, verifier))).error, "invalid_grant");
    const redirect = await getCode(clientId, verifier);
    assert.equal((await json(await exchange(clientId, redirect, verifier, { redirect_uri: "https://chatgpt.com/other" }))).error, "invalid_grant");
  });

  it("authenticates confidential clients (basic and post) and refuses a missing secret", async () => {
    const registered = await json(await register({ client_name: "Claude", redirect_uris: [CALLBACK] }));
    const clientId = registered.client_id as string;
    const secret = registered.client_secret as string;
    const verifier = verifierOf();
    const code = await getCode(clientId, verifier);
    const missing = await exchange(clientId, code, verifier);
    assert.equal(missing.status, 401);
    assert.equal((await json(missing)).error, "invalid_client");
    const basic = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
    const wrong = await form("/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: CALLBACK }, { Authorization: `Basic ${Buffer.from(`${clientId}:nope`).toString("base64")}` });
    assert.equal(wrong.status, 401);
    assert.match(wrong.headers.get("www-authenticate") ?? "", /^Basic/);
    const ok = await form("/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: CALLBACK }, { Authorization: basic });
    assert.equal(ok.status, 200);
    const refresh = (await json(ok)).refresh_token as string;
    const post = await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, client_secret: secret, refresh_token: refresh });
    assert.equal(post.status, 200);
  });

  it("answers unknown grant types per RFC 6749", async () => {
    const response = await form("/oauth/token", { grant_type: "password", client_id: "x" });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error, "unsupported_grant_type");
  });

  it("rotates refresh tokens; reusing an old one revokes the grant", async () => {
    const { clientId, refresh } = await connect();
    const rotated = await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });
    assert.equal(rotated.status, 200);
    const next = await json(rotated);
    assert.notEqual(next.refresh_token, refresh);
    assert.equal((await mcp(next.access_token as string, "ping")).status, 200);

    const reused = await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });
    assert.equal((await json(reused)).error, "invalid_grant");
    // The whole connection ended, including the newest tokens.
    assert.equal((await mcp(next.access_token as string, "ping")).status, 401);
    const newest = await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: next.refresh_token as string });
    assert.equal((await json(newest)).error, "invalid_grant");
  });

  it("binds refresh tokens to their client and may narrow the scope", async () => {
    const { clientId, refresh } = await connect();
    const other = await publicClient();
    assert.equal((await json(await form("/oauth/token", { grant_type: "refresh_token", client_id: other, refresh_token: refresh }))).error, "invalid_grant");
    const narrowed = await json(await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: refresh, scope: "read" }));
    assert.equal(narrowed.scope, "read");
  });
});

describe("access tokens on /api/mcp", () => {
  it("refuses an expired access token", async () => {
    const { access } = await connect();
    clock += 61 * 60_000;
    assert.equal((await mcp(access, "ping")).status, 401);
  });

  it("refuses a token revoked at /oauth/revoke, or disconnected in the app", async () => {
    const first = await connect();
    const revoked = await form("/oauth/revoke", { client_id: first.clientId, token: first.access });
    assert.equal(revoked.status, 200);
    assert.equal((await mcp(first.access, "ping")).status, 401);
    // A refresh token ends the whole grant.
    await form("/oauth/revoke", { client_id: first.clientId, token: first.refresh });
    assert.equal((await json(await form("/oauth/token", { grant_type: "refresh_token", client_id: first.clientId, refresh_token: first.refresh }))).error, "invalid_grant");

    const second = await connect("clara");
    const list = (await (await app("/", "clara")).json()) as { connected: McpConnectedApp[] };
    assert.equal(list.connected.length, 1);
    assert.equal((await app(`/connected/${list.connected[0]!.id}`, "clara", { method: "DELETE" })).status, 204);
    assert.equal((await mcp(second.access, "ping")).status, 401);
  });

  it("acts as the person, with the app's name, and a read grant can't call write tools", async () => {
    const { access } = await connect("clara", "read");
    const list = (await json(await mcp(access, "tools/list"))) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("oauthtest_read"));
    assert.ok(!names.includes("oauthtest_add"));
    const write = (await json(await mcp(access, "tools/call", { name: "oauthtest_add", arguments: { name: "x", confirm: true } }))) as { error?: { code: number } };
    assert.equal(write.error?.code, -32602);
    const read = (await json(await mcp(access, "tools/call", { name: "oauthtest_read", arguments: {} }))) as { result: { content: { text: string }[] } };
    assert.deepEqual(JSON.parse(read.result.content[0]!.text), { hello: "Clara", via: "ChatGPT" });
  });

  it("stops working when the account is disabled or becomes a child", async () => {
    const { access } = await connect("clara");
    users.get("clara")!.role = "child";
    assert.equal((await mcp(access, "ping")).status, 401);
    users.get("clara")!.role = "adult";
    assert.equal((await mcp(access, "ping")).status, 200);
    users.get("clara")!.disabled = true;
    assert.equal((await mcp(access, "ping")).status, 401);
  });

  it("never crosses households", async () => {
    const { access } = await connect("rob");
    // Another household's owner neither sees nor revokes it.
    const theirs = (await (await app("/", "eve")).json()) as { connected: McpConnectedApp[] };
    assert.equal(theirs.connected.length, 0);
    const ours = (await (await app("/", "rob")).json()) as { connected: McpConnectedApp[] };
    assert.equal((await app(`/connected/${ours.connected[0]!.id}`, "eve", { method: "DELETE" })).status, 404);
    assert.equal((await mcp(access, "ping")).status, 200);
    // A person moved to another household loses the grant made in the first one.
    users.get("rob")!.householdId = "h2";
    assert.equal((await mcp(access, "ping")).status, 401);
  });

  it("keeps a household's manual OAuth app to that household", async () => {
    const created = await app("/apps", "rob", { method: "POST", body: JSON.stringify({ name: "My agent", redirectUris: "https://agent.example/cb", confidential: false }) });
    assert.equal(created.status, 201);
    const { clientId } = (await created.json()) as { clientId: string };
    const started = await fetch(authorizeUrl(clientId, { redirect_uri: "https://agent.example/cb" }), { redirect: "manual" });
    const id = started.headers.get("location")!.replace("/connect/", "");
    assert.equal((await app(`/requests/${id}`, "eve")).status, 404);
    assert.equal((await app(`/requests/${id}`, "clara")).status, 200);
  });
});

describe("personal tokens next to OAuth", () => {
  it("a wh_mcp_ token works with DCR on and off", async () => {
    for (const dcrEnabled of [true, false]) {
      await memory.store.writeSettings({ dcrEnabled, allowedHosts: ["chatgpt.com"] });
      const response = await mcp("wh_mcp_personal", "ping");
      assert.equal(response.status, 200, `DCR ${dcrEnabled}`);
    }
    assert.equal((await mcp("wh_mcp_unknown", "ping")).status, 401);
  });
});

describe("the Assistant card API", () => {
  it("shows settings and apps to owners only; only owners change them", async () => {
    const owner = (await (await app("/", "rob")).json()) as { settings: McpOAuthSettings | null; serverUrl: string };
    assert.deepEqual(owner.settings, { dcrEnabled: true, allowedHosts: ["chatgpt.com", "claude.ai"] });
    assert.equal(owner.serverUrl, RESOURCE);
    const adult = (await (await app("/", "clara")).json()) as { settings: unknown; apps: unknown };
    assert.equal(adult.settings, null);
    assert.equal(adult.apps, null);
    assert.equal((await app("/settings", "clara", { method: "PATCH", body: JSON.stringify({ dcrEnabled: false }) })).status, 403);
    assert.equal((await app("/apps", "clara", { method: "POST", body: JSON.stringify({ name: "x", redirectUris: "https://x.example/cb" }) })).status, 403);
  });

  it("validates the allow-list and switches DCR", async () => {
    const bad = await app("/settings", "rob", { method: "PATCH", body: JSON.stringify({ allowedHosts: "chatgpt.com\nhttps://evil.example" }) });
    assert.equal(bad.status, 400);
    const ok = await app("/settings", "rob", { method: "PATCH", body: JSON.stringify({ dcrEnabled: false, allowedHosts: "ChatGPT.com\nclaude.ai\nchatgpt.com" }) });
    assert.deepEqual(await ok.json(), { dcrEnabled: false, allowedHosts: ["chatgpt.com", "claude.ai"] });
  });

  it("makes a manual app with a secret shown once, needs https, and deletes it", async () => {
    const http = await app("/apps", "rob", { method: "POST", body: JSON.stringify({ name: "Agent", redirectUris: "http://agent.example/cb" }) });
    assert.equal(http.status, 400);
    const created = (await (await app("/apps", "rob", { method: "POST", body: JSON.stringify({ name: "Agent", redirectUris: "https://agent.example/cb", confidential: "on" }) })).json()) as {
      id: string;
      clientSecret: string;
      confidential: boolean;
    };
    assert.match(created.clientSecret, /^wh_cs_/);
    assert.equal(created.confidential, true);
    const listed = (await (await app("/", "rob")).json()) as { apps: Record<string, unknown>[] };
    assert.ok(listed.apps.every((item) => !("clientSecret" in item) && !("secretHash" in item)));
    // Another household's owner: as if it didn't exist.
    assert.equal((await app(`/apps/${created.id}`, "eve", { method: "DELETE" })).status, 404);
    assert.equal((await app(`/apps/${created.id}`, "rob", { method: "DELETE" })).status, 204);
  });
});
