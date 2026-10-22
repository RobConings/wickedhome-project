import { config } from "../lib/config";
import { db } from "../lib/db";
import { decryptSecret, secretsAvailable } from "../lib/secrets";
import { GoogleApiError } from "./google-http";
import { AccessTokenCache, isRevokedError, refreshAccessToken, type TokenSet } from "./google-oauth";

/** What Google needs from `.env`, or `null` while something is missing. */
export function googleClientConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !secretsAvailable()) return null;
  return { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, redirectUri: config.GOOGLE_REDIRECT_URI };
}

/** The `.env` variables Google still needs. */
export function missingGoogleEnv(): string[] {
  return [
    ...(config.GOOGLE_CLIENT_ID ? [] : ["GOOGLE_CLIENT_ID"]),
    ...(config.GOOGLE_CLIENT_SECRET ? [] : ["GOOGLE_CLIENT_SECRET"]),
    ...(secretsAvailable() ? [] : ["INTEGRATIONS_KEY"]),
  ];
}

/** Encryption context of a user's refresh token: a ciphertext copied to another user doesn't decrypt. */
export const refreshTokenContext = (userId: string) => `google:refresh:${userId}`;

export class GoogleUnavailableError extends Error {}

const tokens = new AccessTokenCache();

export type ConnectionForAccess = { id: string; userId: string; refreshTokenEnc: string; status: "CONNECTED" | "NEEDS_RECONNECT" };

export const seedAccessToken = (connectionId: string, set: TokenSet) => tokens.put(connectionId, set);
export const forgetAccessToken = (connectionId: string) => tokens.forget(connectionId);

/** Shortens an error for `lastError` columns (no tokens or mail content ever end up in these messages). */
export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/**
 * A valid access token for a connection (from memory, else refreshed). When Google refuses the refresh token
 * (revoked or expired consent) the connection is marked NEEDS_RECONNECT and a `GoogleUnavailableError` thrown.
 */
export async function accessTokenFor(connection: ConnectionForAccess): Promise<string> {
  const client = googleClientConfig();
  if (!client) throw new GoogleUnavailableError("Google is not configured");
  if (connection.status !== "CONNECTED") throw new GoogleUnavailableError("Google needs to be reconnected");
  try {
    return await tokens.get(connection.id, () =>
      refreshAccessToken(client, decryptSecret(connection.refreshTokenEnc, refreshTokenContext(connection.userId))),
    );
  } catch (error) {
    if (isRevokedError(error)) {
      await db.googleConnection.update({
        where: { id: connection.id },
        data: { status: "NEEDS_RECONNECT", lastError: "Google no longer accepts this connection" },
      });
      throw new GoogleUnavailableError("Google needs to be reconnected");
    }
    throw error;
  }
}

/** Runs `work` with an access token; a 401 drops the cached token and tries once more with a fresh one. */
export async function withGoogle<T>(connection: ConnectionForAccess, work: (accessToken: string) => Promise<T>): Promise<T> {
  try {
    return await work(await accessTokenFor(connection));
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 401) throw error;
    tokens.forget(connection.id);
    return work(await accessTokenFor(connection));
  }
}
