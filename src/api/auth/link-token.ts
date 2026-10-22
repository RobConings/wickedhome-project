import { createHash, randomBytes } from "node:crypto";
import type { LinkKind, LinkStatus } from "@/features/auth/types/accounts";

/**
 * One-time link tokens (invites and password resets). The token is 32 random bytes (base64url, 43
 * characters) and only ever exists in the link; the database stores its SHA-256. No database access here,
 * so the rules are unit-tested (link-token.test.ts).
 */

const HOUR_MS = 60 * 60 * 1000;

/** How long a link stays usable. */
export const LINK_LIFETIME_MS: Record<LinkKind, number> = {
  invite: 7 * 24 * HOUR_MS,
  password_reset: 24 * HOUR_MS,
};

export const hashLinkToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashLinkToken(token) };
}

export const linkExpiry = (kind: LinkKind, now: Date) => new Date(now.getTime() + LINK_LIFETIME_MS[kind]);

/** Revoked wins over used, used over expired: the message then names the real reason. */
export function linkStatus(
  link: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null },
  now: Date,
): LinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.usedAt) return "used";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
