import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { authorizationAttempt, callbackGrant, ISSUER, RESOURCE, SCOPES, verifyIdentity } from "./chatgpt-oauth";

describe("official ChatGPT pairing OAuth", () => {
  it("uses fresh PKCE/state, complete scopes, stable host and dynamic registration", () => {
    const attempt = authorizationAttempt("urn:uuid:host", "nonce", "http://127.0.0.1:1455/auth/callback");
    const params = new URL(attempt.url).searchParams;
    assert.equal(params.get("client_id"), "dynamic_agent_client"); assert.equal(params.get("resource"), RESOURCE);
    assert.equal(params.get("scope"), SCOPES); assert.equal(params.get("agent_name_hint"), "WickedHome");
    assert.equal(params.get("code_challenge"), createHash("sha256").update(attempt.verifier).digest("base64url"));
    assert.notEqual(attempt.state, authorizationAttempt("host", "n", attempt.redirectUri).state);
    assert.throws(() => authorizationAttempt("host", "n", "https://home.test/auth/callback"));
    assert.throws(() => authorizationAttempt("host", "n", "http://localhost:1455/auth/callback"));
  });
  it("requires the issued client ID, rejects state mismatch and declined consent", () => {
    const attempt = authorizationAttempt("host", "nonce", "http://127.0.0.1:1455/auth/callback");
    assert.throws(() => callbackGrant(attempt, new URL(`${attempt.redirectUri}?code=c&state=wrong&client_id=issued`)));
    assert.throws(() => callbackGrant(attempt, new URL(`${attempt.redirectUri}?code=c&state=${attempt.state}`)));
    assert.throws(() => callbackGrant(attempt, new URL(`${attempt.redirectUri}?error=access_denied&state=${attempt.state}`)));
    assert.deepEqual(callbackGrant(attempt, new URL(`${attempt.redirectUri}?code=c&state=${attempt.state}&client_id=issued`)), { clientId: "issued", code: "c" });
  });
  it("reuses returning registration and rejects another client's callback", () => {
    const attempt = authorizationAttempt("host", "nonce", "http://127.0.0.1:9876/auth/callback", { clientId: "issued", email: "person@example.test" });
    assert.equal(new URL(attempt.url).searchParams.has("agent_name_hint"), false);
    assert.deepEqual(callbackGrant(attempt, new URL(`${attempt.redirectUri}?code=c&state=${attempt.state}`)), { clientId: "issued", code: "c" });
    assert.throws(() => callbackGrant(attempt, new URL(`${attempt.redirectUri}?code=c&state=${attempt.state}&client_id=other`)));
  });
  it("validates signature, issuer, audience, expiry and nonce", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const key = await exportJWK(publicKey); key.kid = "test";
    const verifyKey = createLocalJWKSet({ keys: [key] });
    const token = await new SignJWT({ nonce: "expected", email: "person@example.test" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(ISSUER).setAudience("issued").setSubject("subject").setExpirationTime("5m").sign(privateKey);
    assert.deepEqual(await verifyIdentity(token, "issued", "expected", verifyKey), { subject: "subject", email: "person@example.test" });
    await assert.rejects(verifyIdentity(token, "other", "expected", verifyKey));
    await assert.rejects(verifyIdentity(token, "issued", "wrong", verifyKey));
    const expired = await new SignJWT({ nonce: "expected" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(ISSUER).setAudience("issued").setSubject("subject").setExpirationTime(1).sign(privateKey);
    await assert.rejects(verifyIdentity(expired, "issued", "expected", verifyKey));
  });
});
