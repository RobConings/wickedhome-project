import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config";

/*
 * Secrets at rest (integration tokens)
 * ────────────────────────────────────
 * Per-user tokens (a Google refresh token…) are stored encrypted with AES-256-GCM under one server-wide key,
 * `INTEGRATIONS_KEY` in `.env` (32 random bytes, base64: `openssl rand -base64 32`). The key never reaches the
 * database, the browser or the logs; a database dump without `.env` holds no usable tokens.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts, 96-bit random IV, 128-bit tag). The optional
 * `context` is authenticated as associated data (e.g. `google:refresh:<userId>`), so a ciphertext copied
 * to another row or user doesn't decrypt.
 *
 * Losing or changing the key makes stored tokens unreadable: people reconnect, nothing else breaks.
 */

/** The command people run to create a key, shown wherever an integration is "not configured". */
export const KEY_SETUP_COMMAND = "openssl rand -base64 32";

const VERSION = "v1";

export class SecretsUnavailableError extends Error {
  constructor() {
    super("INTEGRATIONS_KEY is not configured");
  }
}

/** Parses a base64 key; `null` unless it is exactly 32 bytes. */
export function parseKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  return key.length === 32 ? key : null;
}

let warned = false;
function configuredKey(): Buffer | null {
  const key = parseKey(config.INTEGRATIONS_KEY);
  if (!key && config.INTEGRATIONS_KEY && !warned) {
    warned = true;
    console.warn(`[secrets] INTEGRATIONS_KEY must be 32 bytes, base64 (${KEY_SETUP_COMMAND}); integrations stay off.`);
  }
  return key;
}

/** Whether encrypted secrets can be stored and read (a valid `INTEGRATIONS_KEY` is set). */
export const secretsAvailable = () => configuredKey() !== null;

function requireKey(key: Buffer | null | undefined): Buffer {
  const resolved = key ?? configuredKey();
  if (!resolved) throw new SecretsUnavailableError();
  return resolved;
}

/** Encrypts `plain`. `context` must be passed again to decrypt. `key` is for tests; default is the configured one. */
export function encryptSecret(plain: string, context = "", key?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypts what `encryptSecret` produced. Throws on a wrong key, wrong context or tampered data. */
export function decryptSecret(sealed: string, context = "", key?: Buffer): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
