import { config } from "../lib/config";
import { db } from "../lib/db";
import { decryptSecret, encryptSecret, secretsAvailable } from "../lib/secrets";
import { generateVapidKeys, type VapidKeys } from "./web-push";

/*
 * The server's VAPID key pair (its Web Push identity). Phones subscribe against the public key, so it must
 * stay the same: changing it silently breaks every subscription (people re-enable on each device).
 *
 * 1. `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in .env win.
 * 2. Otherwise one pair is generated on first use and kept in `web_push_keys` (row "vapid"), so the owner has
 *    nothing to set up. The private key is encrypted with INTEGRATIONS_KEY (src/api/lib/secrets.ts) when that
 *    is set, else stored plain (Settings → Notifications says so to owners). A plain key is encrypted as soon
 *    as INTEGRATIONS_KEY appears.
 *
 * The private key never leaves the server: not to the browser, not to logs.
 */

const ROW_ID = "vapid";
const SECRET_CONTEXT = "webpush:vapid";

export type KeyStorage = "env" | "encrypted" | "plain";

let cached: { keys: VapidKeys; storage: KeyStorage } | null = null;
let loading: Promise<{ keys: VapidKeys; storage: KeyStorage }> | null = null;

const isSealed = (value: string) => value.startsWith("v1.");

async function load(): Promise<{ keys: VapidKeys; storage: KeyStorage }> {
  const subject = config.VAPID_SUBJECT;
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    return { keys: { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY, subject }, storage: "env" };
  }

  const existing = await db.webPushKey.findUnique({ where: { id: ROW_ID } });
  if (existing) {
    if (!isSealed(existing.privateKey)) {
      if (secretsAvailable()) {
        await db.webPushKey.update({ where: { id: ROW_ID }, data: { privateKey: encryptSecret(existing.privateKey, SECRET_CONTEXT) } });
        return { keys: { publicKey: existing.publicKey, privateKey: existing.privateKey, subject }, storage: "encrypted" };
      }
      return { keys: { publicKey: existing.publicKey, privateKey: existing.privateKey, subject }, storage: "plain" };
    }
    try {
      return { keys: { publicKey: existing.publicKey, privateKey: decryptSecret(existing.privateKey, SECRET_CONTEXT), subject }, storage: "encrypted" };
    } catch {
      // INTEGRATIONS_KEY changed or was removed: the stored key is lost. A new pair means re-enabling on every device.
      console.warn("[notifications] the stored Web Push key can't be decrypted (INTEGRATIONS_KEY changed?); generating a new one");
      await db.webPushKey.delete({ where: { id: ROW_ID } });
      await db.pushSubscription.deleteMany({});
    }
  }

  const fresh = generateVapidKeys();
  const sealed = secretsAvailable();
  // Two processes may race on the first use: the first insert wins and both read it back.
  await db.webPushKey.createMany({
    data: [{ id: ROW_ID, publicKey: fresh.publicKey, privateKey: sealed ? encryptSecret(fresh.privateKey, SECRET_CONTEXT) : fresh.privateKey }],
    skipDuplicates: true,
  });
  const row = await db.webPushKey.findUniqueOrThrow({ where: { id: ROW_ID } });
  const privateKey = isSealed(row.privateKey) ? decryptSecret(row.privateKey, SECRET_CONTEXT) : row.privateKey;
  console.log("[notifications] generated the Web Push (VAPID) key pair");
  return { keys: { publicKey: row.publicKey, privateKey, subject }, storage: isSealed(row.privateKey) ? "encrypted" : "plain" };
}

/** The key pair and where it lives. Loaded once per process. */
export async function getVapid(): Promise<{ keys: VapidKeys; storage: KeyStorage }> {
  if (cached) return cached;
  loading ??= load()
    .then((result) => {
      cached = result;
      return result;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The public key for the browser (`applicationServerKey`). */
export const getVapidPublicKey = async () => (await getVapid()).keys.publicKey;

/** Tests only. */
export const resetVapidCache = () => {
  cached = null;
};
