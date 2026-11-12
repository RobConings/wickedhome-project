import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export const ISSUER = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
export const tokenSchema = z.object({
  access_token: z.string().min(1).max(32000), refresh_token: z.string().min(1).max(32000),
  id_token: z.string().min(1).max(32000), token_type: z.literal("Bearer"),
  expires_in: z.number().positive(), scope: z.string().max(2000),
});
export type OAuthTokens = z.infer<typeof tokenSchema>;
export class ChatGptAuthError extends Error {
  constructor(readonly code: string, readonly status = 401) { super(code); }
}
export async function verifyIdentity(idToken: string, clientId: string, nonce?: string, verificationKey: JWTVerifyGetKey = jwks) {
  const { payload } = await jwtVerify(idToken, verificationKey, { issuer: ISSUER, audience: clientId, algorithms: ["RS256"], clockTolerance: 5 });
  if (!payload.sub || !payload.exp || (nonce !== undefined && payload.nonce !== nonce)) throw new ChatGptAuthError("invalid_identity");
  return { subject: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}
export function authorizationAttempt(hostId: string, nonce: string, redirectUri: string, registration?: { clientId: string; email?: string | null }, consent = false) {
  const callback = new URL(redirectUri);
  if (callback.protocol !== "http:" || callback.hostname !== "127.0.0.1" || callback.pathname !== "/auth/callback") throw new Error("A 127.0.0.1 loopback callback is required");
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({ client_id: registration?.clientId ?? "dynamic_agent_client", ext_agent_host_id: hostId, response_type: "code", redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
  if (!registration) params.set("agent_name_hint", "WickedHome");
  if (registration?.email) params.set("login_hint", registration.email);
  if (consent) params.set("prompt", "consent");
  return { verifier, state, nonce, redirectUri, clientId: registration?.clientId, url: `${ISSUER}/api/accounts/authorize?${params}` };
}
export function callbackGrant(attempt: ReturnType<typeof authorizationAttempt>, url: URL) {
  if (url.searchParams.get("state") !== attempt.state) throw new ChatGptAuthError("invalid_state");
  if (url.searchParams.has("error")) throw new ChatGptAuthError("authorization_declined");
  const returned = url.searchParams.get("client_id");
  if (attempt.clientId && returned && returned !== attempt.clientId) throw new ChatGptAuthError("client_mismatch");
  const clientId = attempt.clientId ?? returned;
  const code = url.searchParams.get("code");
  if (!clientId || clientId === "dynamic_agent_client" || !code) throw new ChatGptAuthError("incomplete_registration");
  return { clientId, code };
}
export async function tokenRequest(params: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${ISSUER}/api/accounts/oauth/token`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params, signal: AbortSignal.timeout(30000) });
  const body = await response.json() as { error?: string | { code?: string } };
  if (!response.ok) throw new ChatGptAuthError(typeof body.error === "string" ? body.error : body.error?.code ?? "token_request_failed", response.status);
  return body;
}
