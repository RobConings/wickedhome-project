/**
 * Unit tests for one-time link tokens: hashing, expiry and status. No database needed. Run on the server:
 *
 *   npx tsx --test src/api/auth/link-token.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { linkPath, linkTokenSchema } from "@/features/auth/types/accounts";
import { LINK_LIFETIME_MS, createLinkToken, hashLinkToken, linkExpiry, linkStatus } from "./link-token";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-02T10:00:00Z");

describe("createLinkToken", () => {
  it("makes a 43-character base64url token that the link schema accepts", () => {
    const { token } = createLinkToken();
    assert.equal(token.length, 43);
    assert.ok(linkTokenSchema.safeParse(token).success);
  });

  it("stores only the SHA-256 of the token", () => {
    const { token, tokenHash } = createLinkToken();
    assert.equal(tokenHash, createHash("sha256").update(token).digest("hex"));
    assert.equal(tokenHash, hashLinkToken(token));
    assert.notEqual(tokenHash, token);
    assert.ok(!tokenHash.includes(token));
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createLinkToken().token));
    assert.equal(tokens.size, 200);
  });
});

describe("linkTokenSchema", () => {
  it("rejects anything that is not a 43-character base64url string", () => {
    for (const value of ["", "abc", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`, 42, null]) {
      assert.equal(linkTokenSchema.safeParse(value).success, false, String(value));
    }
  });
});

describe("linkExpiry", () => {
  it("gives invites 7 days and password resets 24 hours", () => {
    assert.equal(linkExpiry("invite", now).getTime() - now.getTime(), 7 * 24 * HOUR);
    assert.equal(linkExpiry("password_reset", now).getTime() - now.getTime(), 24 * HOUR);
    assert.equal(LINK_LIFETIME_MS.password_reset, 24 * HOUR);
  });
});

describe("linkStatus", () => {
  const link = { expiresAt: new Date(now.getTime() + HOUR), usedAt: null, revokedAt: null };

  it("is valid until it expires, and expired from the expiry moment on", () => {
    assert.equal(linkStatus(link, now), "valid");
    assert.equal(linkStatus(link, new Date(now.getTime() + HOUR - 1)), "valid");
    assert.equal(linkStatus(link, new Date(now.getTime() + HOUR)), "expired");
  });

  it("names the real reason: revoked over used over expired", () => {
    const later = new Date(now.getTime() + 2 * HOUR);
    assert.equal(linkStatus({ ...link, usedAt: now }, now), "used");
    assert.equal(linkStatus({ ...link, usedAt: now }, later), "used");
    assert.equal(linkStatus({ ...link, revokedAt: now, usedAt: now }, later), "revoked");
  });
});

describe("linkPath", () => {
  it("puts invites under /invite and resets under /reset", () => {
    assert.equal(linkPath("invite", "abc"), "/invite/abc");
    assert.equal(linkPath("password_reset", "abc"), "/reset/abc");
  });
});
