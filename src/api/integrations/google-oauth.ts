import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_BASE_SCOPES, GOOGLE_FEATURE_SCOPES, type GoogleFeature } from "@/features/integrations/types/google";
import { GoogleApiError, googleJson } from "./google-http";

/*
 * Google OAuth 2.0, our own implementation (no library): authorization code + PKCE (S256) + state.
 *
 *   POST /api/integrations/google/start   → state row (hash of state, encrypted verifier, session id) → Google URL
 *   Google consent screen
 *   GET  /api/integrations/google/callback?code&state
 *        (top-level navigation from accounts.google.com: our SameSite=Strict session cookie is NOT sent here,
 *         so the callback only stores the code on the state row and redirects to /integrations?google=finish)
 *   POST /api/integrations/google/finish  (same-site fetch: the cookie is sent) → only the session that started
 *        the round can finish it → code + verifier exchanged for tokens → refresh token stored encrypted.
 *
 * The pure parts live here (and are unit-tested); the database parts are in google-connection.service.ts.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** A consent round must be finished within this time. */
export const STATE_TTL_MS = 10 * 60 * 1000;

const base64url = (bytes: Buffer) => bytes.toString("base64url");
export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

/** RFC 7636: a 64-character verifier (48 random bytes) and its S256 challenge. */
export function createPkcePair(random: (size: number) => Buffer = randomBytes): { verifier: string; challenge: string } {
  const verifier = base64url(random(48));
  return { verifier, challenge: pkceChallenge(verifier) };
}

export const pkceChallenge = (verifier: string) => base64url(createHash("sha256").update(verifier).digest());

/** 32 random bytes; only its SHA-256 is stored. */
export const createState = (random: (size: number) => Buffer = randomBytes) => base64url(random(32));

/** The scopes for a set of features plus the base scopes, de-duplicated and sorted. */
export function scopesFor(features: readonly GoogleFeature[]): string[] {
  return [...new Set([...GOOGLE_BASE_SCOPES, ...features.flatMap((feature) => GOOGLE_FEATURE_SCOPES[feature])])].sort();
}

/** Union of scope lists (incremental consent adds; Google returns the full granted set anyway). */
export const mergeScopes = (...lists: readonly (readonly string[])[]) => [...new Set(lists.flat())].sort();

export type AuthUrlInput = {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeChallenge: string;
  /** The connected account's email, so Google preselects it when adding scopes. */
  loginHint?: string | null;
};

/**
 * The consent URL. `access_type=offline` + `prompt=consent` so Google always returns a refresh token;
 * `include_granted_scopes=true` makes it incremental (the new token covers earlier grants too).
 */
export function buildAuthUrl({ clientId, redirectUri, scopes, state, codeChallenge, loginHint }: AuthUrlInput): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    ...(loginHint && { login_hint: loginHint }),
  }).toString();
  return url.toString();
}

/** A stored state row, as far as the checks need it. */
export type StateRecord = { sessionId: string; expiresAt: Date; codeEnc: string | null };

/** Whether the callback may store a code on this state row (exists, not expired, not used yet). */
export const canReceiveCode = (row: StateRecord | null, now = new Date()): row is StateRecord =>
  row !== null && row.expiresAt > now && row.codeEnc === null;

/** Whether `sessionId` may finish this round (same session, not expired, code received). */
export const canFinish = (row: StateRecord | null, sessionId: string | undefined, now = new Date()): row is StateRecord & { codeEnc: string } =>
  row !== null && sessionId !== undefined && row.sessionId === sessionId && row.expiresAt > now && row.codeEnc !== null;

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────────

export type TokenSet = {
  accessToken: string;
  /** Absolute expiry (ms since epoch). */
  expiresAt: number;
  /** Only in some responses (the code exchange); refreshing returns none. */
  refreshToken: string | null;
  scopes: string[];
  idToken: string | null;
};

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  id_token?: unknown;
};

export function parseTokenResponse(body: TokenResponse, now = Date.now()): TokenSet {
  if (typeof body.access_token !== "string" || !body.access_token) throw new GoogleApiError("Token response without access_token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in ?? 3600);
  return {
    accessToken: body.access_token,
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean).sort() : [],
    idToken: typeof body.id_token === "string" ? body.id_token : null,
  };
}

/**
 * Reads `sub` and `email` from an ID token. No signature check: the token comes straight from Google's
 * token endpoint over TLS in our own request (OpenID Connect Core 3.1.3.7 allows this).
 */
export function decodeIdToken(idToken: string): { subject: string; email: string } {
  const payload = idToken.split(".")[1];
  if (!payload) throw new GoogleApiError("Malformed ID token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; email?: unknown };
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new GoogleApiError("ID token without sub/email");
  return { subject: claims.sub, email: claims.email };
}

export type OAuthClientConfig = { clientId: string; clientSecret: string };

/** Exchanges an authorization code (with its PKCE verifier) for tokens. */
export async function exchangeCode(client: OAuthClientConfig, input: { code: string; verifier: string; redirectUri: string }): Promise<TokenSet> {
  const body = await googleJson<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
  });
  return parseTokenResponse(body);
}

/** A new access token for a refresh token. `invalid_grant` (revoked/expired consent) comes back as a GoogleApiError reason. */
export async function refreshAccessToken(client: OAuthClientConfig, refreshToken: string): Promise<TokenSet> {
  const body = await googleJson<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
  });
  return parseTokenResponse(body);
}

/** Withdraws the consent at Google (the refresh token and every access token from it). 400 = already invalid. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await googleJson(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 400) return;
    throw error;
  }
}

/** The consent is gone for good: the person must connect again. */
export const isRevokedError = (error: unknown) =>
  error instanceof GoogleApiError && (error.reason === "invalid_grant" || error.reason === "unauthorized_client");

// ── Access token cache ───────────────────────────────────────────────────────────────────────────────

/**
 * Access tokens live in memory only, per connection, until a minute before they expire. Concurrent callers
 * share one refresh. A failed refresh is not cached.
 */
export class AccessTokenCache {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly marginMs = 60_000,
  ) {}

  async get(key: string, refresh: () => Promise<TokenSet>): Promise<string> {
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt - this.marginMs > this.now()) return cached.token;
    const running = this.inFlight.get(key);
    if (running) return running;
    const promise = refresh()
      .then((set) => {
        this.tokens.set(key, { token: set.accessToken, expiresAt: set.expiresAt });
        return set.accessToken;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  /** After a 401, or when the connection changes. */
  forget(key: string): void {
    this.tokens.delete(key);
  }

  /** Seeds the cache with a token we just got (the code exchange). */
  put(key: string, set: TokenSet): void {
    this.tokens.set(key, { token: set.accessToken, expiresAt: set.expiresAt });
  }
}
