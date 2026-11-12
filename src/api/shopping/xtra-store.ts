import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { xtraCredentialsSchema } from "@/features/shopping/types/xtra";
import { config } from "../lib/config";
import { HttpError } from "../lib/http";
import { decryptSecret, encryptSecret } from "../lib/secrets";

const operationSchema = z.object({ id: z.string(), fingerprint: z.string(), state: z.enum(["pending", "done", "uncertain"]), result: z.unknown().optional() });
const connectionSchema = z.object({
  version: z.literal(1), revision: z.string(), credentials: xtraCredentialsSchema,
  userIds: z.array(z.string()), connectedAt: z.string(), checkedAt: z.string(), needsReconnect: z.boolean(),
  operations: z.array(operationSchema).max(10000),
});
export type XtraConnection = z.infer<typeof connectionSchema>;
const root = () => resolve(config.STORAGE_DIR, "..", "xtra-private");
const pathOf = (householdId: string) => join(root(), `${createHash("sha256").update(householdId).digest("hex")}.enc`);
export async function readXtraConnection(householdId: string): Promise<XtraConnection | null> {
  try {
    return connectionSchema.parse(JSON.parse(decryptSecret(await readFile(pathOf(householdId), "utf8"), `xtra:${householdId}`)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new HttpError(409, "xtra_storage", "The Xtra connection cannot be read with this server's integration key. Ask the connection manager to reconnect.");
  }
}
export async function saveXtraConnection(householdId: string, value: XtraConnection) {
  const encrypted = encryptSecret(JSON.stringify(connectionSchema.parse(value)), `xtra:${householdId}`);
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const file = pathOf(householdId), temporary = `${file}.${randomBytes(8).toString("hex")}`;
  try { await writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function deleteXtraConnection(householdId: string) {
  await unlink(pathOf(householdId)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

// The household server runs one API process. All connection changes and upstream calls share this lock;
// revocation completes after any already-running call, and queued calls recheck the saved ACL.
const pending = new Map<string, Promise<unknown>>();
export async function withXtraLock<T>(householdId: string, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(householdId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  pending.set(householdId, next);
  try { return await next; } finally { if (pending.get(householdId) === next) pending.delete(householdId); }
}
