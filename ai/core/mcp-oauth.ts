import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import {
  MCP_OAUTH_DEFAULT_HOSTS,
  MCP_OAUTH_MAX_REDIRECT_URIS,
  redirectUriHost,
  type CreatedMcpOAuthApp,
  type McpConnectedApp,
  type McpOAuthApp,
  type McpOAuthAppInput,
  type McpOAuthConsent,
  type McpOAuthDecisionInput,
  type McpOAuthOverview,
  type McpOAuthScope,
  type McpOAuthSettings,
  type McpOAuthSettingsInput,
} from "@/features/assistant/types/mcp-oauth";
import { badRequest, conflict, forbidden, notFound } from "@/api/lib/http";
import type { TokenIdentity } from "./assistant.service";

/**
 * OAuth 2.1 authorization server for the MCP endpoint (ai/docs/MCP-OAUTH.md), so ChatGPT and Claude can
 * connect as a custom connector. The MCP authorization spec: protected resource metadata (RFC 9728),
 * authorization server metadata (RFC 8414), dynamic client registration (RFC 7591), authorization code with
 * PKCE S256 only, resource indicators (RFC 8707), token revocation (RFC 7009).
 *
 * This file is the logic only, over an `OAuthStore` (Prisma in mcp-oauth.store.ts, in memory in the tests),
 * so every rule is testable without a database. HTTP is in mcp-oauth.routes.ts.
 *
 * Tokens are opaque random strings with a recognisable prefix, stored as SHA-256 only: access tokens
 * (`wh_at_`, 1 hour) and refresh tokens (`wh_rt_`, 30 days, rotated on every use; presenting a used one again
 * revokes the whole grant). Codes are single use (60 s); presenting one again revokes the grant made from it.
 * A grant is one person's consent for one client, bound to the person's household; children never get one.
 */

export const ACCESS_TOKEN_PREFIX = "wh_at_";
export const REFRESH_TOKEN_PREFIX = "wh_rt_";
const CLIENT_ID_PREFIX = "wh_client_";
const CLIENT_SECRET_PREFIX = "wh_cs_";

const MINUTE = 60_000;
export const OAUTH_TTL_MS = {
  /** A validated authorize request waiting for consent. */
  request: 10 * MINUTE,
  code: MINUTE,
  access: 60 * MINUTE,
  refresh: 30 * 24 * 60 * MINUTE,
  /** Dynamic clients not used for this long, and without a live grant, are deleted (`assistant.oauth-cleanup`). */
  idleDynamicClient: 60 * MINUTE,
} as const;

/** Only touch `lastUsedAt` once a minute, not on every MCP call. */
const TOUCH_MS = MINUTE;
const MAX_MANUAL_APPS = 20;
export const TOKEN_AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;
type TokenAuthMethod = (typeof TOKEN_AUTH_METHODS)[number];

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = (prefix: string, bytes = 32) => `${prefix}${randomBytes(bytes).toString("base64url")}`;

/** Compares two hex digests in constant time. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

// ── PKCE, scopes, resource ────────────────────────────────────────────────────────────────────────────

const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/;

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** RFC 7636 S256: base64url(SHA-256(verifier)) must equal the challenge sent to /authorize. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!PKCE_VALUE.test(verifier)) return false;
  const expected = Buffer.from(pkceChallenge(verifier));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The scopes of an authorize request: space-separated `read` / `write`. Nothing means both are offered (the
 * person chooses); `write` alone also offers `read`. `null` for an unknown scope.
 */
export function parseScopes(raw: string | undefined): McpOAuthScope[] | null {
  const words = (raw ?? "").split(" ").filter(Boolean);
  if (words.some((word) => word !== "read" && word !== "write")) return null;
  return words.length === 0 || words.includes("write") ? ["read", "write"] : ["read"];
}

/** The `scope` of a token response. */
export const scopeString = (scope: McpOAuthScope) => (scope === "write" ? "read write" : "read");

/** One trailing slash doesn't make another resource. */
export const normalizeResource = (value: string) => (value.endsWith("/") ? value.slice(0, -1) : value);

// ── Discovery ─────────────────────────────────────────────────────────────────────────────────────────

export type OAuthUrls = {
  issuer: string;
  /** The MCP endpoint: the audience of every token. */
  resource: string;
  authorize: string;
  token: string;
  register: string;
  revoke: string;
  resourceMetadata: string;
};

/** Every URL from the public origin (`PUBLIC_URL`, no trailing slash). */
export function oauthUrls(publicUrl: string): OAuthUrls {
  const base = publicUrl.replace(/\/+$/, "");
  return {
    issuer: base,
    resource: `${base}/api/mcp`,
    authorize: `${base}/oauth/authorize`,
    token: `${base}/oauth/token`,
    register: `${base}/oauth/register`,
    revoke: `${base}/oauth/revoke`,
    resourceMetadata: `${base}/.well-known/oauth-protected-resource`,
  };
}

/** RFC 9728, at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp`. */
export const protectedResourceMetadata = (urls: OAuthUrls) => ({
  resource: urls.resource,
  authorization_servers: [urls.issuer],
  scopes_supported: ["read", "write"],
  bearer_methods_supported: ["header"],
  resource_name: "WickedHome",
});

/** RFC 8414, at `/.well-known/oauth-authorization-server`. The registration endpoint only while DCR is on. */
export const authorizationServerMetadata = (urls: OAuthUrls, dcrEnabled: boolean) => ({
  issuer: urls.issuer,
  authorization_endpoint: urls.authorize,
  token_endpoint: urls.token,
  ...(dcrEnabled && { registration_endpoint: urls.register }),
  revocation_endpoint: urls.revoke,
  scopes_supported: ["read", "write"],
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: [...TOKEN_AUTH_METHODS],
  revocation_endpoint_auth_methods_supported: [...TOKEN_AUTH_METHODS],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: false,
});

// ── Store ─────────────────────────────────────────────────────────────────────────────────────────────

export type ClientRecord = {
  id: string;
  clientId: string;
  kind: "dynamic" | "manual";
  name: string;
  redirectUris: string[];
  secretHash: string | null;
  authMethod: TokenAuthMethod;
  householdId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type RequestRecord = {
  id: string;
  /** The client's record id (not its public client_id). */
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: McpOAuthScope[];
  resource: string;
  userId: string | null;
  csrfHash: string | null;
  expiresAt: Date;
};

export type CodeRecord = {
  id: string;
  codeHash: string;
  clientId: string;
  userId: string;
  householdId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: McpOAuthScope;
  resource: string;
  expiresAt: Date;
  usedAt: Date | null;
  grantId: string | null;
};

export type GrantRecord = {
  id: string;
  clientId: string;
  userId: string;
  householdId: string;
  scope: McpOAuthScope;
  resource: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type TokenRecord = {
  id: string;
  grantId: string;
  kind: "access" | "refresh";
  tokenHash: string;
  scope: McpOAuthScope;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

export type StoredUser = SessionUser & { disabled: boolean };

/** Persistence for the OAuth server. Every "conditional" write returns whether it changed a row (atomic). */
export type OAuthStore = {
  readSettings: () => Promise<McpOAuthSettings>;
  writeSettings: (settings: McpOAuthSettings) => Promise<void>;
  createClient: (client: Omit<ClientRecord, "id" | "createdAt" | "lastUsedAt"> & { createdById: string | null }) => Promise<ClientRecord>;
  /** By the public `client_id`. */
  findClient: (clientId: string) => Promise<ClientRecord | null>;
  findClientById: (id: string) => Promise<ClientRecord | null>;
  listManualClients: (householdId: string) => Promise<ClientRecord[]>;
  deleteManualClient: (id: string, householdId: string) => Promise<boolean>;
  touchClient: (id: string, at: Date) => Promise<void>;
  createRequest: (request: RequestRecord) => Promise<void>;
  findRequest: (id: string) => Promise<RequestRecord | null>;
  /** Binds the request to a person (only if unbound or already theirs) and sets its CSRF hash. */
  claimRequest: (id: string, userId: string, csrfHash: string) => Promise<boolean>;
  deleteRequest: (id: string) => Promise<boolean>;
  createCode: (code: Omit<CodeRecord, "id" | "usedAt" | "grantId">) => Promise<void>;
  findCode: (codeHash: string) => Promise<CodeRecord | null>;
  /** Marks it used, only if it wasn't. */
  consumeCode: (id: string, at: Date) => Promise<boolean>;
  linkCodeToGrant: (id: string, grantId: string) => Promise<void>;
  createGrant: (grant: Omit<GrantRecord, "id" | "lastUsedAt" | "revokedAt" | "createdAt">) => Promise<GrantRecord>;
  findGrant: (id: string) => Promise<GrantRecord | null>;
  revokeGrant: (id: string, at: Date) => Promise<boolean>;
  touchGrant: (id: string, at: Date) => Promise<void>;
  /** Grants not revoked and with a live refresh token, of a household (one person's only, with `userId`). */
  listActiveGrants: (householdId: string, userId: string | null, now: Date) => Promise<McpConnectedApp[]>;
  createToken: (token: Omit<TokenRecord, "id" | "usedAt" | "revokedAt">) => Promise<void>;
  findToken: (tokenHash: string) => Promise<TokenRecord | null>;
  /** Marks a refresh token exchanged, only if it wasn't. */
  useToken: (id: string, at: Date) => Promise<boolean>;
  revokeToken: (id: string, at: Date) => Promise<void>;
  findUser: (id: string) => Promise<StoredUser | null>;
  /** Removes what expired, revoked grants, and dynamic clients idle since `idleBefore` without a live grant. */
  cleanup: (now: Date, idleBefore: Date) => Promise<{ clients: number; grants: number; tokens: number }>;
};

// ── Errors ────────────────────────────────────────────────────────────────────────────────────────────

/** An RFC 6749 / 7591 error: `{ error, error_description }` with this status. */
export class OAuthError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly description: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(description);
  }
  get body() {
    return { error: this.error, error_description: this.description };
  }
}

const invalidRequest = (description: string) => new OAuthError(400, "invalid_request", description);
const invalidGrant = (description: string) => new OAuthError(400, "invalid_grant", description);
const invalidClient = (basic: boolean) =>
  new OAuthError(401, "invalid_client", "Client authentication failed", basic ? { "WWW-Authenticate": 'Basic realm="wickedhome-oauth"' } : {});

/** What `/oauth/authorize` answers: a redirect, or a page when the redirect URI itself can't be trusted. */
export type AuthorizeOutcome = { type: "redirect"; location: string } | { type: "page"; status: number; message: string };

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const cleanName = (value: unknown) => {
  const name = (typeof value === "string" ? value : "").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return name || "MCP client";
};
const hostOf = (uri: string) => redirectUriHost(uri) ?? uri;

function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, value);
  return url.toString();
}

/** A person who may hold OAuth tokens for this household: enabled, not a child, still in it. */
const usable = (user: StoredUser | null, householdId: string): user is StoredUser =>
  !!user && !user.disabled && user.role !== "child" && user.householdId === householdId;

const toApp = (client: ClientRecord): McpOAuthApp => ({
  id: client.id,
  clientId: client.clientId,
  name: client.name,
  redirectUris: client.redirectUris,
  confidential: client.secretHash !== null,
  lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
  createdAt: client.createdAt.toISOString(),
});

const requireOwner = (role: Role) => {
  if (role !== "owner") throw forbidden();
};

// ── The server ────────────────────────────────────────────────────────────────────────────────────────

export type McpOAuth = ReturnType<typeof createMcpOAuth>;

export function createMcpOAuth({ store, urls, now = () => new Date() }: { store: OAuthStore; urls: OAuthUrls; now?: () => Date }) {
  const later = (ms: number) => new Date(now().getTime() + ms);

  /** A dynamic client may only keep sending tokens to hosts that are still allowed. */
  async function redirectAllowed(client: ClientRecord, redirectUri: string): Promise<boolean> {
    if (!client.redirectUris.includes(redirectUri)) return false;
    if (client.kind === "manual") return redirectUriHost(redirectUri) !== null;
    const { allowedHosts } = await store.readSettings();
    return redirectUriHost(redirectUri, allowedHosts) !== null;
  }

  /** The request behind a consent page, if it's still valid for this person. */
  async function openRequest(user: SessionUser, id: string) {
    const request = id.length <= 100 ? await store.findRequest(id) : null;
    if (!request || request.expiresAt <= now() || (request.userId && request.userId !== user.id)) throw notFound("This request expired");
    const client = await store.findClientById(request.clientId);
    // A manual app is its household's: someone else gets the same answer as for an unknown request.
    if (!client || (client.kind === "manual" && client.householdId !== user.householdId) || !(await redirectAllowed(client, request.redirectUri))) {
      throw notFound("This request expired");
    }
    return { request, client };
  }

  async function authenticateClient(params: Record<string, unknown>, authorization: string | undefined): Promise<ClientRecord> {
    let clientId = str(params.client_id);
    let secret = str(params.client_secret) || undefined;
    let basic = false;
    if (authorization?.toLowerCase().startsWith("basic ")) {
      basic = true;
      if (params.client_secret !== undefined) throw invalidRequest("Use one client authentication method");
      const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon < 0) throw invalidClient(true);
      let basicId: string;
      try {
        basicId = decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " "));
        secret = decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " ")) || undefined;
      } catch {
        throw invalidClient(true);
      }
      if (clientId && clientId !== basicId) throw invalidRequest("client_id doesn't match the credentials");
      clientId = basicId;
    }
    if (!clientId || clientId.length > 200) throw invalidClient(basic);
    const client = await store.findClient(clientId);
    if (!client) throw invalidClient(basic);
    if (client.secretHash) {
      if (!secret || !sameHash(sha256(secret), client.secretHash)) throw invalidClient(basic);
    } else if (secret) {
      // A public client has no secret: one that sends a secret is not who it says.
      throw invalidClient(basic);
    }
    return client;
  }

  async function issueTokens(grant: GrantRecord, scope: McpOAuthScope) {
    const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
    const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
    await store.createToken({ grantId: grant.id, kind: "access", tokenHash: sha256(accessToken), scope, expiresAt: later(OAUTH_TTL_MS.access) });
    await store.createToken({ grantId: grant.id, kind: "refresh", tokenHash: sha256(refreshToken), scope, expiresAt: later(OAUTH_TTL_MS.refresh) });
    await store.touchGrant(grant.id, now());
    await store.touchClient(grant.clientId, now());
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: OAUTH_TTL_MS.access / 1000,
      refresh_token: refreshToken,
      scope: scopeString(scope),
    };
  }

  function checkResource(params: Record<string, unknown>, resource: string) {
    const requested = params.resource;
    if (requested === undefined) return;
    if (typeof requested !== "string" || normalizeResource(requested) !== resource) throw new OAuthError(400, "invalid_target", "Unknown resource");
  }

  async function exchangeCode(client: ClientRecord, params: Record<string, unknown>) {
    const raw = str(params.code);
    if (!raw) throw invalidRequest("code is required");
    const code = raw.length <= 200 ? await store.findCode(sha256(raw)) : null;
    if (!code || code.clientId !== client.id) throw invalidGrant("Invalid authorization code");
    if (code.usedAt || !(await store.consumeCode(code.id, now()))) {
      // Replay: whoever has this code shouldn't, so the grant made from it ends too.
      const current = code.grantId ? code : await store.findCode(code.codeHash);
      if (current?.grantId) await store.revokeGrant(current.grantId, now());
      throw invalidGrant("Authorization code already used");
    }
    if (code.expiresAt <= now()) throw invalidGrant("Authorization code expired");
    if (str(params.redirect_uri) !== code.redirectUri) throw invalidGrant("redirect_uri doesn't match");
    const verifier = str(params.code_verifier);
    if (!verifier || !verifyPkce(verifier, code.codeChallenge)) throw invalidGrant("PKCE verification failed");
    checkResource(params, code.resource);
    if (!usable(await store.findUser(code.userId), code.householdId)) throw invalidGrant("The account can't be used");
    const grant = await store.createGrant({ clientId: client.id, userId: code.userId, householdId: code.householdId, scope: code.scope, resource: code.resource });
    await store.linkCodeToGrant(code.id, grant.id);
    return issueTokens(grant, code.scope);
  }

  async function refresh(client: ClientRecord, params: Record<string, unknown>) {
    const raw = str(params.refresh_token);
    if (!raw) throw invalidRequest("refresh_token is required");
    const token = raw.startsWith(REFRESH_TOKEN_PREFIX) && raw.length <= 200 ? await store.findToken(sha256(raw)) : null;
    const grant = token?.kind === "refresh" ? await store.findGrant(token.grantId) : null;
    if (!token || !grant || grant.clientId !== client.id || grant.revokedAt || token.revokedAt) throw invalidGrant("Invalid refresh token");
    if (token.usedAt || !(await store.useToken(token.id, now()))) {
      // Reuse detection: a rotated refresh token came back, so it leaked. End the whole connection.
      await store.revokeGrant(grant.id, now());
      throw invalidGrant("Refresh token already used; the connection was revoked");
    }
    if (token.expiresAt <= now()) throw invalidGrant("Refresh token expired");
    checkResource(params, grant.resource);
    let scope = token.scope;
    if (params.scope !== undefined) {
      const requested = parseScopes(str(params.scope));
      const words = (str(params.scope) ?? "").split(" ").filter(Boolean);
      if (!requested || (words.includes("write") && scope !== "write")) throw new OAuthError(400, "invalid_scope", "More than was granted");
      if (!words.includes("write")) scope = "read";
    }
    if (!usable(await store.findUser(grant.userId), grant.householdId)) throw invalidGrant("The account can't be used");
    return issueTokens(grant, scope);
  }

  return {
    urls,
    readSettings: () => store.readSettings(),

    /** `POST /oauth/register` (RFC 7591). Only https redirect URIs on an allow-listed host. */
    async register(body: unknown) {
      const settings = await store.readSettings();
      if (!settings.dcrEnabled) throw new OAuthError(404, "invalid_request", "Dynamic client registration is off");
      const input = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
      const uris = input.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || uris.length > MCP_OAUTH_MAX_REDIRECT_URIS || !uris.every((uri) => typeof uri === "string")) {
        throw new OAuthError(400, "invalid_redirect_uri", `redirect_uris must list 1 to ${MCP_OAUTH_MAX_REDIRECT_URIS} https URLs`);
      }
      for (const uri of uris as string[]) {
        if (!redirectUriHost(uri, settings.allowedHosts)) throw new OAuthError(400, "invalid_redirect_uri", `Redirect URI not allowed: ${uri.slice(0, 200)}`);
      }
      const method = input.token_endpoint_auth_method ?? "client_secret_basic";
      if (!(TOKEN_AUTH_METHODS as readonly unknown[]).includes(method)) throw new OAuthError(400, "invalid_client_metadata", "Unsupported token_endpoint_auth_method");
      const grantTypes = input.grant_types ?? ["authorization_code"];
      if (!Array.isArray(grantTypes) || !grantTypes.includes("authorization_code") || grantTypes.some((type) => type !== "authorization_code" && type !== "refresh_token")) {
        throw new OAuthError(400, "invalid_client_metadata", "grant_types: authorization_code and refresh_token only");
      }
      const responseTypes = input.response_types ?? ["code"];
      if (!Array.isArray(responseTypes) || responseTypes.some((type) => type !== "code")) throw new OAuthError(400, "invalid_client_metadata", "response_types: code only");
      if (input.scope !== undefined && (typeof input.scope !== "string" || !parseScopes(input.scope))) throw new OAuthError(400, "invalid_client_metadata", "scope: read and/or write");

      const authMethod = method as TokenAuthMethod;
      const secret = authMethod === "none" ? null : randomToken(CLIENT_SECRET_PREFIX);
      const client = await store.createClient({
        clientId: randomToken(CLIENT_ID_PREFIX, 16),
        kind: "dynamic",
        name: cleanName(input.client_name),
        redirectUris: [...new Set(uris as string[])],
        secretHash: secret ? sha256(secret) : null,
        authMethod,
        householdId: null,
        createdById: null,
      });
      return {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: authMethod,
        scope: "read write",
      };
    },

    /** `GET /oauth/authorize`: validates, then sends the browser to the consent page (`/connect/<id>`). */
    async authorize(query: Record<string, unknown>): Promise<AuthorizeOutcome> {
      const clientId = str(query.client_id);
      const redirectUri = str(query.redirect_uri);
      const client = clientId && clientId.length <= 200 ? await store.findClient(clientId) : null;
      // Without a known client and an exact, still-allowed redirect URI, nothing is sent anywhere.
      if (!client) return { type: "page", status: 400, message: "Unknown client (client_id)." };
      if (!redirectUri || !(await redirectAllowed(client, redirectUri))) return { type: "page", status: 400, message: "This redirect_uri is not registered for this client." };

      const state = str(query.state);
      const fail = (error: string, description: string): AuthorizeOutcome => ({
        type: "redirect",
        location: withParams(redirectUri, { error, error_description: description, state: state && state.length <= 2048 ? state : undefined, iss: urls.issuer }),
      });
      if (query.response_type !== "code") return fail("unsupported_response_type", "response_type must be code");
      const challenge = str(query.code_challenge);
      if (!challenge) return fail("invalid_request", "code_challenge is required (PKCE)");
      if (query.code_challenge_method !== "S256") return fail("invalid_request", "code_challenge_method must be S256");
      if (!PKCE_VALUE.test(challenge)) return fail("invalid_request", "Malformed code_challenge");
      if (state !== undefined && state.length > 2048) return fail("invalid_request", "state is too long");
      // RFC 8707: this server only issues tokens for the MCP endpoint. Clients that leave it out get that too.
      const resource = query.resource === undefined ? urls.resource : typeof query.resource === "string" ? normalizeResource(query.resource) : "";
      if (resource !== urls.resource) return fail("invalid_target", "resource must be the MCP endpoint");
      if (query.scope !== undefined && typeof query.scope !== "string") return fail("invalid_scope", "Malformed scope");
      const scopes = parseScopes(str(query.scope));
      if (!scopes) return fail("invalid_scope", "Supported scopes: read, write");

      const id = randomBytes(32).toString("base64url");
      await store.createRequest({
        id,
        clientId: client.id,
        redirectUri,
        state: state ?? null,
        codeChallenge: challenge,
        scopes,
        resource,
        userId: null,
        csrfHash: null,
        expiresAt: later(OAUTH_TTL_MS.request),
      });
      await store.touchClient(client.id, now());
      return { type: "redirect", location: `/connect/${id}` };
    },

    /** The consent page's data; binds the request to this person and renews its CSRF token. */
    async consent(user: SessionUser, id: string): Promise<McpOAuthConsent> {
      const { request, client } = await openRequest(user, id);
      const csrf = randomBytes(24).toString("base64url");
      if (!(await store.claimRequest(request.id, user.id, sha256(csrf)))) throw notFound("This request expired");
      return {
        clientName: client.name,
        kind: client.kind,
        redirectHost: hostOf(request.redirectUri),
        requestedScopes: request.scopes,
        refused: user.role === "child" ? "child" : null,
        csrf,
        expiresAt: request.expiresAt.toISOString(),
      };
    },

    /** Allow or deny: a one-time code (or `access_denied`) for the client's redirect URI. */
    async decide(user: SessionUser, id: string, input: McpOAuthDecisionInput): Promise<{ redirectTo: string; clientName: string; allowed: boolean }> {
      const { request, client } = await openRequest(user, id);
      if (request.userId !== user.id || !request.csrfHash || !sameHash(sha256(input.csrf), request.csrfHash)) throw forbidden("Reload the page and try again");
      const back = (params: Record<string, string>) => withParams(request.redirectUri, { ...params, state: request.state, iss: urls.issuer });
      if (input.decision === "deny") {
        await store.deleteRequest(request.id);
        return { redirectTo: back({ error: "access_denied", error_description: "The person declined" }), clientName: client.name, allowed: false };
      }
      if (user.role === "child") throw forbidden("Children can't connect apps");
      if (!request.scopes.includes(input.scope)) throw badRequest("Not requested", { scope: ["notRequested"] });
      // Single use: only the request that is still there gets a code.
      if (!(await store.deleteRequest(request.id))) throw notFound("This request expired");
      const code = randomBytes(32).toString("base64url");
      await store.createCode({
        codeHash: sha256(code),
        clientId: client.id,
        userId: user.id,
        householdId: user.householdId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        scope: input.scope,
        resource: request.resource,
        expiresAt: later(OAUTH_TTL_MS.code),
      });
      return { redirectTo: back({ code }), clientName: client.name, allowed: true };
    },

    /** `POST /oauth/token`: authorization_code (PKCE) or refresh_token. */
    async token(params: Record<string, unknown>, authorization: string | undefined) {
      const grantType = str(params.grant_type);
      if (grantType !== "authorization_code" && grantType !== "refresh_token") {
        throw new OAuthError(400, grantType ? "unsupported_grant_type" : "invalid_request", "grant_type: authorization_code or refresh_token");
      }
      const client = await authenticateClient(params, authorization);
      return grantType === "authorization_code" ? exchangeCode(client, params) : refresh(client, params);
    },

    /** `POST /oauth/revoke` (RFC 7009): a refresh token ends its grant, an access token only itself. */
    async revoke(params: Record<string, unknown>, authorization: string | undefined): Promise<void> {
      const client = await authenticateClient(params, authorization);
      const raw = str(params.token);
      if (!raw) throw invalidRequest("token is required");
      const token = raw.length <= 200 ? await store.findToken(sha256(raw)) : null;
      const grant = token ? await store.findGrant(token.grantId) : null;
      // Unknown tokens and other clients' tokens: 200 and nothing happens (RFC 7009 §2.2).
      if (!token || !grant || grant.clientId !== client.id) return;
      if (token.kind === "refresh") await store.revokeGrant(grant.id, now());
      else await store.revokeToken(token.id, now());
    },

    /** The person behind an OAuth access token for `/api/mcp`, or null (unknown, expired, revoked, other audience). */
    async authenticateAccessToken(raw: string): Promise<TokenIdentity | null> {
      if (!raw.startsWith(ACCESS_TOKEN_PREFIX) || raw.length > 200) return null;
      const token = await store.findToken(sha256(raw));
      if (!token || token.kind !== "access" || token.revokedAt || token.expiresAt <= now()) return null;
      const grant = await store.findGrant(token.grantId);
      if (!grant || grant.revokedAt || grant.resource !== urls.resource) return null;
      const [client, user] = await Promise.all([store.findClientById(grant.clientId), store.findUser(grant.userId)]);
      if (!client || !usable(user, grant.householdId)) return null;
      if (!grant.lastUsedAt || now().getTime() - grant.lastUsedAt.getTime() > TOUCH_MS) {
        await store.touchGrant(grant.id, now());
        await store.touchClient(client.id, now());
      }
      const { disabled: _disabled, ...sessionUser } = user;
      return {
        user: sessionUser,
        scope: token.scope === "write" && grant.scope === "write" ? "write" : "read",
        tokenId: `oauth:${grant.id}`,
        tokenName: client.name,
        via: client.name,
      };
    },

    // ── The Assistant card ──

    async overview(user: SessionUser): Promise<McpOAuthOverview> {
      const owner = user.role === "owner";
      const connected = await store.listActiveGrants(user.householdId, owner ? null : user.id, now());
      return {
        serverUrl: urls.resource,
        connected,
        settings: owner ? await store.readSettings() : null,
        apps: owner ? (await store.listManualClients(user.householdId)).map(toApp) : null,
      };
    },

    /** Owners may disconnect anyone in the household, others only themselves. Returns the app's name. */
    async disconnect(user: SessionUser, grantId: string): Promise<string> {
      const grant = await store.findGrant(grantId);
      if (!grant || grant.revokedAt || grant.householdId !== user.householdId || (user.role !== "owner" && grant.userId !== user.id)) throw notFound("Not connected");
      await store.revokeGrant(grant.id, now());
      return (await store.findClientById(grant.clientId))?.name ?? "";
    },

    async updateSettings(user: SessionUser, input: McpOAuthSettingsInput): Promise<McpOAuthSettings> {
      requireOwner(user.role);
      const current = await store.readSettings();
      const next = { dcrEnabled: input.dcrEnabled ?? current.dcrEnabled, allowedHosts: input.allowedHosts ?? current.allowedHosts };
      await store.writeSettings(next);
      return next;
    },

    async createApp(user: SessionUser, input: McpOAuthAppInput): Promise<CreatedMcpOAuthApp> {
      requireOwner(user.role);
      if ((await store.listManualClients(user.householdId)).length >= MAX_MANUAL_APPS) throw conflict("Too many OAuth apps; delete one first");
      const secret = input.confidential ? randomToken(CLIENT_SECRET_PREFIX) : null;
      const client = await store.createClient({
        clientId: randomToken(CLIENT_ID_PREFIX, 16),
        kind: "manual",
        name: input.name,
        redirectUris: input.redirectUris,
        secretHash: secret ? sha256(secret) : null,
        authMethod: secret ? "client_secret_basic" : "none",
        householdId: user.householdId,
        createdById: user.id,
      });
      return { ...toApp(client), clientSecret: secret };
    },

    async deleteApp(user: SessionUser, id: string): Promise<void> {
      requireOwner(user.role);
      if (!(await store.deleteManualClient(id, user.householdId))) throw notFound("OAuth app not found");
    },

    /** The scheduled cleanup (`assistant.oauth-cleanup`). */
    cleanup: () => store.cleanup(now(), new Date(now().getTime() - OAUTH_TTL_MS.idleDynamicClient)),
  };
}

/** Settings when there is no row yet. */
export const DEFAULT_OAUTH_SETTINGS: McpOAuthSettings = { dcrEnabled: true, allowedHosts: [...MCP_OAUTH_DEFAULT_HOSTS] };
