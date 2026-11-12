import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { db } from "../src/api/lib/db";
import { saveCollectAndGoSession } from "../src/api/shopping/collect-and-go-session";
const { values } = parseArgs({ options: { user: { type: "string" }, file: { type: "string" } } });
if (!values.user || !values.file) throw new Error("Usage: npm run collectandgo:import -- --user your@email --file /protected/session.json");
try {
  const info = await stat(values.file);
  if (info.size > 1000000 || (process.platform !== "win32" && (info.mode & 0o077))) throw new Error("Session file must be owner-only (chmod 600) and at most 1 MB");
  const user = await db.user.findUnique({ where: { email: values.user }, select: { id: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new Error("No active WickedHome user with that email");
  await saveCollectAndGoSession(user.id, JSON.parse(await readFile(values.file, "utf8")));
  console.log("Collect&Go session encrypted and imported. Delete the transferred plaintext session file.");
} catch { console.error("Import failed. Check the user, session file permissions, allowed cookie domains and INTEGRATIONS_KEY."); process.exitCode = 1; }
finally { await db.$disconnect(); }
