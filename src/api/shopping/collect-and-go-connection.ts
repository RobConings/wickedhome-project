import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { SessionUser } from "@/features/auth/types/auth";
import { collectAndGoStateSchema, type CollectAndGoStatus } from "@/features/shopping/types/collect-and-go";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { forbidden, HttpError } from "../lib/http";
import { decryptSecret, encryptSecret, secretsAvailable } from "../lib/secrets";
import { readCollectAndGoSession } from "./collect-and-go-session";

const connectionSchema = z.object({ version: z.literal(1), revision: z.string(), state: collectAndGoStateSchema, userIds: z.array(z.string()).max(100), importedAt: z.string(), needsReconnect: z.boolean(), verifiedAt: z.string().datetime().nullable().optional() });
export type CollectAndGoConnection = z.infer<typeof connectionSchema>;
const root = () => resolve(config.STORAGE_DIR, "..", "collect-and-go-shared");
const fileOf = (householdId: string) => join(root(), `${createHash("sha256").update(householdId).digest("hex")}.enc`);
export const collectAndGoEnabled = () => process.env.COLLECTANDGO_ENABLED === "1";
export const collectAndGoCartAvailable = () => secretsAvailable() || collectAndGoEnabled();
export function requireCollectAndGoOwner(user: SessionUser) { if (user.role !== "owner") throw forbidden("Only household owners can manage the shared Collect&Go connection."); }
export async function collectAndGoMembers(householdId: string, userIds: string[]) {
  const members = await db.user.findMany({ where: { householdId, disabledAt: null }, select: { id: true, email: true, role: true, habitant: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  if (userIds.some((id) => !members.some((member) => member.id === id))) throw new HttpError(400, "collectandgo_members", "Choose active accounts from this household only.");
  return members;
}
export async function readCollectAndGoConnection(householdId: string): Promise<CollectAndGoConnection | null> {
  try { return connectionSchema.parse(JSON.parse(decryptSecret(await readFile(fileOf(householdId), "utf8"), `collect-and-go-shared:${householdId}`))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new HttpError(409, "collectandgo_storage", "The shared Collect&Go connection cannot be read. Ask an owner to import a new session.");
  }
}
export async function saveCollectAndGoConnection(householdId: string, connection: CollectAndGoConnection) {
  const encrypted = encryptSecret(JSON.stringify(connectionSchema.parse(connection)), `collect-and-go-shared:${householdId}`);
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const file = fileOf(householdId), temporary = `${file}.${randomBytes(8).toString("hex")}`;
  try { await writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function deleteCollectAndGoConnection(householdId: string) { await unlink(fileOf(householdId)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }

const locks = new Map<string, Promise<unknown>>();
export async function withCollectAndGoConnection<T>(householdId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(householdId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  locks.set(householdId, current);
  try { return await current; } finally { if (locks.get(householdId) === current) locks.delete(householdId); }
}
export async function requireCollectAndGoAccess(user: SessionUser) {
  const connection = await readCollectAndGoConnection(user.householdId);
  if (!connection || !connection.userIds.includes(user.id)) throw forbidden("You don't have access to the shared Collect&Go connection. Ask an owner to select your account in Settings.");
  if (connection.needsReconnect) throw new HttpError(409, "collectandgo_login", "The shared Collect&Go connection needs a new login or browser verification. Ask an owner to reconnect it in Settings.");
  return connection;
}
export async function collectAndGoStatus(user: SessionUser): Promise<CollectAndGoStatus> {
  const canManage = user.role === "owner";
  let unreadable = false;
  const connection = await readCollectAndGoConnection(user.householdId).catch((error) => { if (!canManage) throw error; unreadable = true; return null; });
  const canUse = Boolean(connection?.userIds.includes(user.id)), visible = canUse || canManage;
  const legacy = canManage && !connection ? await readCollectAndGoSession(user.id).catch(() => null) : null;
  return { enabled: collectAndGoEnabled(), cartEnabled: visible && secretsAvailable() && Boolean(connection?.state.cartApi), configured: secretsAvailable(), connected: visible && Boolean(connection), canManage, canUse, needsReconnect: unreadable || (visible && Boolean(connection?.needsReconnect)), legacyAvailable: Boolean(legacy), importedAt: visible ? connection?.importedAt ?? null : null, verifiedAt: visible && !connection?.needsReconnect ? connection?.verifiedAt ?? null : null, members: canManage ? (await collectAndGoMembers(user.householdId, [])).map((member) => ({ id: member.id, name: member.habitant?.name ?? member.email, role: member.role.toLowerCase(), allowed: connection?.userIds.includes(member.id) ?? false })) : [] };
}
