import type { SessionUser } from "@/features/auth/types/auth";
import {
  featuresFromScopes,
  GOOGLE_RETURN_PARAM,
  type GoogleFeature,
  type GoogleReturnState,
  type GoogleStatus,
} from "@/features/integrations/types/google";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { HttpError, conflict } from "../lib/http";
import { decryptSecret, encryptSecret } from "../lib/secrets";
import { targetKeyFilterForUser } from "./drive-storage-keys";
import { errorText, forgetAccessToken, googleClientConfig, missingGoogleEnv, refreshTokenContext, seedAccessToken } from "./google-access";
import { calendarSettings, syncConnectionCalendars } from "./google-calendar.service";
import { ensureDefaultRules } from "./gmail.service";
import {
  STATE_TTL_MS,
  buildAuthUrl,
  canFinish,
  canReceiveCode,
  createPkcePair,
  createState,
  decodeIdToken,
  exchangeCode,
  mergeScopes,
  revokeToken,
  scopesFor,
  sha256Hex,
} from "./google-oauth";

const pkceContext = (stateId: string) => `google:pkce:${stateId}`;
const codeContext = (stateId: string) => `google:code:${stateId}`;

const notConfigured = () => new HttpError(503, "not_configured", "Google is not configured on this server");

function requireClient() {
  const client = googleClientConfig();
  if (!client) throw notConfigured();
  return client;
}

/** Everything the Google card shows for this person. */
export async function getGoogleStatus(user: SessionUser): Promise<GoogleStatus> {
  const missing = missingGoogleEnv();
  const redirectUri = config.GOOGLE_REDIRECT_URI;
  const base = { missing, redirectUri, connectOrigin: new URL(redirectUri).origin };
  if (missing.length) return { ...base, status: "not_configured", connection: null, calendar: null, gmail: null, drive: null };

  const connection = await db.googleConnection.findUnique({ where: { userId: user.id } });
  if (!connection) return { ...base, status: "disconnected", connection: null, calendar: null, gmail: null, drive: null };

  const features = featuresFromScopes(connection.scopes);
  const [calendar, pendingCount, linkCount, storedFileCount] = await Promise.all([
    features.includes("calendar") ? calendarSettings(connection) : Promise.resolve(null),
    db.mailBillSuggestion.count({ where: { connectionId: connection.id, status: "PENDING" } }),
    db.googleDriveLink.count({ where: { connectionId: connection.id } }),
    db.documentFile.count({ where: { householdId: user.householdId, storageProvider: "GOOGLE_DRIVE", storageKey: targetKeyFilterForUser(user.id) } }),
  ]);
  return {
    ...base,
    status: connection.status === "CONNECTED" ? "connected" : "error",
    connection: {
      email: connection.googleAccountEmail,
      status: connection.status === "CONNECTED" ? "connected" : "needs_reconnect",
      lastError: connection.lastError,
      connectedAt: connection.connectedAt.toISOString(),
      features,
    },
    calendar,
    gmail: features.includes("gmail")
      ? { lastScanAt: connection.gmailLastScanAt?.toISOString() ?? null, lastError: connection.gmailError, pendingCount }
      : null,
    drive: features.includes("drive") ? { linkCount, storedFileCount } : null,
  };
}

/**
 * Starts a consent round for `features` (plus whatever was granted before: Google merges them). The state
 * row is bound to this session and lives 10 minutes; only the state's hash and the encrypted verifier are stored.
 */
export async function startGoogleAuthorization(user: SessionUser, sessionId: string, features: GoogleFeature[]): Promise<string> {
  const client = requireClient();
  const existing = await db.googleConnection.findUnique({ where: { userId: user.id }, select: { scopes: true, googleAccountEmail: true } });
  const scopes = scopesFor(features);
  const state = createState();
  const id = sha256Hex(state);
  const { verifier, challenge } = createPkcePair();

  await db.googleOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { userId: user.id, sessionId }] } });
  await db.googleOAuthState.create({
    data: {
      id,
      userId: user.id,
      sessionId,
      codeVerifierEnc: encryptSecret(verifier, pkceContext(id)),
      scopes,
      redirectUri: client.redirectUri,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return buildAuthUrl({
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    // include_granted_scopes=true: Google adds what was granted before, so only the new feature's scopes are asked.
    scopes,
    state,
    codeChallenge: challenge,
    loginHint: existing?.googleAccountEmail,
  });
}

/**
 * `GET /callback?code&state` (or `?error&state`). Runs without a session (the Strict cookie isn't sent on
 * this cross-site navigation): it only stores the code, encrypted, on the matching unexpired, unused state
 * row. Returns where to send the browser.
 */
export async function receiveGoogleCallback(query: { code?: unknown; state?: unknown; error?: unknown }): Promise<string> {
  const back = (state: GoogleReturnState) => `/integrations?${GOOGLE_RETURN_PARAM}=${state}`;
  const state = typeof query.state === "string" && query.state.length <= 200 ? query.state : null;
  if (!state) return back("error");
  const id = sha256Hex(state);
  const row = await db.googleOAuthState.findUnique({ where: { id } });
  if (typeof query.error === "string") {
    if (row) await db.googleOAuthState.delete({ where: { id } }).catch(() => undefined);
    return back(query.error === "access_denied" ? "denied" : "error");
  }
  if (!row || row.expiresAt <= new Date()) return back("expired");
  if (!canReceiveCode(row) || typeof query.code !== "string" || query.code.length > 2000) return back("error");
  // Only an unused row takes the code: the same callback URL can't be replayed.
  const { count } = await db.googleOAuthState.updateMany({
    where: { id, codeEnc: null },
    data: { codeEnc: encryptSecret(query.code, codeContext(id)) },
  });
  return back(count === 1 ? "finish" : "error");
}

/** Finishes the round of this session: exchanges code + verifier, stores the refresh token encrypted. */
export async function finishGoogleAuthorization(user: SessionUser, sessionId: string | undefined): Promise<GoogleStatus> {
  const client = requireClient();
  const rows = sessionId
    ? await db.googleOAuthState.findMany({ where: { userId: user.id, sessionId, codeEnc: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 })
    : [];
  const row = rows[0] ?? null;
  if (!canFinish(row, sessionId)) throw conflict("No Google connection to finish");
  // Single use: the row goes before anything else can fail.
  await db.googleOAuthState.delete({ where: { id: row.id } });

  const tokens = await exchangeCode(client, {
    code: decryptSecret(row.codeEnc, codeContext(row.id)),
    verifier: decryptSecret(row.codeVerifierEnc, pkceContext(row.id)),
    redirectUri: row.redirectUri,
  });
  if (!tokens.idToken) throw new HttpError(502, "google_error", "Google didn't say which account this is");
  const account = decodeIdToken(tokens.idToken);
  const existing = await db.googleConnection.findUnique({ where: { userId: user.id } });
  const sameAccount = existing?.googleSubject === account.subject;
  const refreshTokenEnc = tokens.refreshToken
    ? encryptSecret(tokens.refreshToken, refreshTokenContext(user.id))
    : sameAccount && existing
      ? existing.refreshTokenEnc
      : null;
  if (!refreshTokenEnc) throw new HttpError(502, "google_error", "Google didn't return a refresh token; remove WickedHome's access in your Google account and connect again");
  const scopes = sameAccount && existing ? mergeScopes(existing.scopes, tokens.scopes) : mergeScopes(tokens.scopes);

  // Another Google account than before: start clean (its calendars, suggestions and links were the old account's).
  if (existing && !sameAccount) {
    await db.googleConnection.delete({ where: { id: existing.id } });
    forgetAccessToken(existing.id);
  }
  const connection = await db.googleConnection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      householdId: user.householdId,
      googleAccountEmail: account.email,
      googleSubject: account.subject,
      refreshTokenEnc,
      scopes,
    },
    update: { googleAccountEmail: account.email, refreshTokenEnc, scopes, status: "CONNECTED", lastError: null },
  });
  seedAccessToken(connection.id, tokens);

  const features = featuresFromScopes(scopes);
  if (features.includes("gmail")) await ensureDefaultRules(user.householdId);
  if (features.includes("calendar")) {
    // First calendar list + sync right away, so the card shows the calendars; failures show on the card.
    await syncConnectionCalendars(connection.id).catch((error: unknown) =>
      db.googleConnection.update({ where: { id: connection.id }, data: { lastError: errorText(error) } }),
    );
  }
  return getGoogleStatus(user);
}

/** Revokes the consent at Google (best effort) and deletes the connection with everything that hangs on it. */
export async function disconnectGoogle(user: SessionUser): Promise<GoogleStatus> {
  const connection = await db.googleConnection.findUnique({ where: { userId: user.id } });
  if (connection) {
    try {
      await revokeToken(decryptSecret(connection.refreshTokenEnc, refreshTokenContext(user.id)));
    } catch (error) {
      console.warn(`[google] revoking failed for a connection: ${errorText(error)}`);
    }
    forgetAccessToken(connection.id);
    // Files that were added to Documents as Drive links lose their access: they stay listed but can't open.
    await db.googleConnection.delete({ where: { id: connection.id } });
  }
  await db.googleOAuthState.deleteMany({ where: { userId: user.id } });
  return getGoogleStatus(user);
}

/** The person's connection for a feature, or a 409 explaining what's missing. */
export async function requireConnection(user: SessionUser, feature: GoogleFeature) {
  if (!googleClientConfig()) throw notConfigured();
  const connection = await db.googleConnection.findUnique({ where: { userId: user.id } });
  if (!connection) throw conflict("Connect Google first");
  if (connection.status !== "CONNECTED") throw conflict("Reconnect Google first");
  if (!featuresFromScopes(connection.scopes).includes(feature)) throw conflict("Turn this Google feature on first");
  return connection;
}
