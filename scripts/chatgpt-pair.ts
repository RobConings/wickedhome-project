/** Desktop loopback OAuth followed by direct TLS credential transfer to the selected home server. */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { authorizationAttempt, callbackGrant, ChatGptAuthError, RESOURCE, tokenRequest, tokenSchema, verifyIdentity } from "../ai/core/providers/chatgpt-oauth";

const { values } = parseArgs({ options: { server: { type: "string" }, code: { type: "string" }, consent: { type: "boolean", default: false } } });
if (!values.server || !values.code) throw new Error("Usage: npm run assistant:pair -- --server https://your-wickedhome --code PAIRING_CODE [--consent]");
const server = new URL(values.server);
if (server.pathname !== "/" || server.search || server.hash || server.username || server.password || (server.protocol !== "https:" && !(server.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(server.hostname)))) throw new Error("Use your WickedHome HTTPS origin (HTTP is allowed only on loopback)");
const post = async (path: string, body: unknown) => {
  const response = await fetch(new URL(`/api/assistant/provider/pairing/${path}`, server), { method: "POST", headers: { "Content-Type": "application/json", "X-WickedHome": "1" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok) throw new Error(`WickedHome pairing failed (HTTP ${response.status}). Start again in AI settings.`);
  return response.status === 204 ? null : response.json();
};
const bootstrap = () => post("bootstrap", { code: values.code }) as Promise<{ nonce: string; registration?: { clientId: string; email: string | null } }>;
const directory = join(homedir(), ".config", "wickedhome");
await mkdir(directory, { recursive: true, mode: 0o700 });
const hostPath = join(directory, "chatgpt-host-id");
try { await writeFile(hostPath, `urn:uuid:${randomUUID()}`, { mode: 0o600, flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
const hostId = (await readFile(hostPath, "utf8")).trim();

async function browserGrant(nonce: string, registration?: { clientId: string; email?: string | null }) {
  const listener = createServer();
  await new Promise<void>((done, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", done); });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Cannot start loopback listener");
  const attempt = authorizationAttempt(hostId, nonce, `http://127.0.0.1:${address.port}/auth/callback`, registration, values.consent);
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const grant = await new Promise<{ clientId: string; code: string }>((done, reject) => {
      timeout = setTimeout(() => reject(new Error("Pairing expired")), 600000);
      listener.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", attempt.redirectUri);
        res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (url.pathname !== "/auth/callback") { res.writeHead(404).end(); return; }
        try { const result = callbackGrant(attempt, url); res.end("Authorization received. Return to your terminal to finish pairing WickedHome."); done(result); }
        catch { res.writeHead(400).end("Authorization failed. Start pairing again in WickedHome."); reject(new Error("OAuth callback rejected")); }
      });
      const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
      const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", attempt.url] : [attempt.url];
      console.log(`Opening ChatGPT authorization for WickedHome at ${server.origin}. Review the account and plan-use permission.`);
      const child = spawn(command, args, { stdio: "ignore", detached: false });
      child.on("error", () => reject(new Error("Could not open the system browser")));
      child.on("exit", (code) => { if (code) reject(new Error("The system browser could not be opened")); });
    });
    return { ...grant, attempt };
  } finally { clearTimeout(timeout!); listener.close(); }
}
try {
  let prepared = await bootstrap();
  let registration = prepared.registration;
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber++) {
    const grant = await browserGrant(prepared.nonce, registration);
    try {
      const tokens = tokenSchema.parse(await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", client_id: grant.clientId, code: grant.code, code_verifier: grant.attempt.verifier, redirect_uri: grant.attempt.redirectUri, resource: RESOURCE })));
      await verifyIdentity(tokens.id_token, grant.clientId, grant.attempt.nonce);
      await post("complete", { code: values.code, clientId: grant.clientId, tokens });
      console.log("ChatGPT connected. Return to WickedHome → Settings → AI assistant, refresh models and select your provider and model. This desktop keeps no tokens; the home server owns refreshes.");
      break;
    } catch (error) {
      if (!(error instanceof ChatGptAuthError) || error.code !== "invalid_grant" || attemptNumber > 0) throw error;
      console.log("The authorization code expired. Starting a fresh sign-in using the issued registration.");
      registration = { clientId: grant.clientId, email: registration?.email ?? null };
      prepared = await bootstrap();
    }
  }
} catch { console.error("Pairing failed. Start again in WickedHome. No credentials were printed or stored on this desktop."); process.exitCode = 1; }
