import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { config } from "../lib/config";
import { decryptSecret, encryptSecret } from "../lib/secrets";

const cookieSchema = z.object({ name: z.string(), value: z.string(), domain: z.string().refine((v) => /(^|\.)(collectandgo\.be|colruytgroup\.com|xtra\.be)$/.test(v)), path: z.string(), expires: z.number(), httpOnly: z.boolean(), secure: z.boolean(), sameSite: z.enum(["Strict", "Lax", "None"]) });
export const collectAndGoStateSchema = z.object({ cookies: z.array(cookieSchema).max(500), origins: z.array(z.object({ origin: z.url().refine((v) => /^https:\/\/([\w-]+\.)?(collectandgo\.be|colruytgroup\.com|xtra\.be)$/.test(v)), localStorage: z.array(z.object({ name: z.string(), value: z.string() })).max(100) })).max(20) });
export type CollectAndGoState = z.infer<typeof collectAndGoStateSchema>;
const root = () => resolve(config.STORAGE_DIR, "..", "collect-and-go");
const pathOf = (userId: string) => join(root(), `${createHash("sha256").update(userId).digest("hex")}.enc`);
export async function saveCollectAndGoSession(userId: string, raw: unknown) {
  const state = collectAndGoStateSchema.parse(raw);
  if (!state.cookies.some((c) => /(^|\.)collectandgo\.be$/.test(c.domain))) throw new Error("No Collect&Go session cookies were found");
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const file = pathOf(userId), tmp = `${file}.${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, encryptSecret(JSON.stringify({ state, importedAt: new Date().toISOString() }), `collect-and-go:${userId}`), { flag: "wx", mode: 0o600 });
  await rename(tmp, file);
}
export async function readCollectAndGoSession(userId: string): Promise<{ state: CollectAndGoState; importedAt: string } | null> {
  try { return JSON.parse(decryptSecret(await readFile(pathOf(userId), "utf8"), `collect-and-go:${userId}`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("Collect&Go session cannot be read. Re-import it with the configured integration key.", { cause: error }); }
}
export async function disconnectCollectAndGo(userId: string) { await unlink(pathOf(userId)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
