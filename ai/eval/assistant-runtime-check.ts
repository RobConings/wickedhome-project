/**
 * Runtime check of the assistant end to end, against the fake model (ai/eval/fake-openai-server.ts) on a
 * throwaway database that is dropped afterwards. Never touches the real data.
 *
 *   npx tsx ai/eval/assistant-runtime-check.ts
 *
 * Needs `DATABASE_URL` in .env with a role that may create databases. Starts the app on APP_PORT (3197) and
 * the fake model on FAKE_PORT (11234), both on 127.0.0.1. Checks: status + connection test, a read tool, a
 * write with confirmation, a sensitive write cancelled, a refusal (no disarm tool is ever offered), MCP
 * (no token, read-only token, write without and with confirm: true), the conversation list, and MCP OAuth on
 * the real tables (discovery, registration, consent, code exchange and replay, refresh rotation and reuse,
 * disconnect, DCR off next to a personal token, a manual app, the cleanup job; ai/docs/MCP-OAUTH.md).
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const APP_PORT = Number(process.env.APP_PORT ?? 3197);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 11234);
const DB = `wh_assistant_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
const APP = `http://127.0.0.1:${APP_PORT}`;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const children: ChildProcess[] = [];
function start(args: string[], env: Record<string, string>, name: string) {
  // The local tsx binary (not npx), so SIGTERM reaches the process itself.
  const child = spawn("node_modules/.bin/tsx", args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  child.on("exit", (code) => {
    if (code && code !== 143) console.log(`${name} exited with ${code}:\n${output.slice(-2000)}`);
  });
  children.push(child);
  return () => output;
}

let cookie = "";
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${APP}${path}`, {
    method,
    headers: { "X-WickedHome": "1", ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0] ?? "";
  return response;
}

type Event = { type: string; [key: string]: unknown };
async function stream(path: string, body: unknown): Promise<Event[]> {
  const response = await call("POST", path, body);
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data:")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(5)) as Event);
}
const textOf = (events: Event[]) => events.filter((event) => event.type === "text").map((event) => String(event.text)).join("");

async function mcp(token: string | null, method: string, params?: unknown) {
  const response = await fetch(`${APP}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as { result?: Record<string, unknown>; error?: { code: number } } | null };
}

async function main() {
  await admin(`CREATE DATABASE ${DB}`);
  console.log(`created ${DB}`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });
  start(["ai/eval/fake-openai-server.ts", String(FAKE_PORT)], {}, "fake model");
  const appLog = start(["src/api/server.ts"], {
    DATABASE_URL: testUrl,
    PORT: String(APP_PORT),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    ASSISTANT_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
    ASSISTANT_MODEL: "fake-model",
    PUBLIC_URL: APP,
    HOME_ASSISTANT_URL: "",
    HOME_ASSISTANT_TOKEN: "",
  }, "app");

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const ok = await fetch(`${APP}/api/health`).then((response) => response.ok).catch(() => false);
    if (ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (attempt === 89) throw new Error(`app did not start:\n${appLog().slice(-2000)}`);
  }

  const setup = await call("POST", "/api/auth/setup", { householdName: "Check", name: "Rob", email: "rob@example.com", password: "a-long-password-1", locale: "en" });
  check("setup + session", setup.ok && Boolean(cookie), String(setup.status));

  const status = (await (await call("GET", "/api/assistant/status")).json()) as { configured: boolean; model: string; tools: { name: string }[] };
  check("status configured", status.configured && status.model === "fake-model", `${status.tools.length} tools`);
  check("no disarm tool in status", !status.tools.some((tool) => /disarm/i.test(tool.name)));
  const probe = (await (await call("POST", "/api/assistant/status/test")).json()) as { latencyMs: number | null; error: string | null };
  check("connection test", probe.error === null && typeof probe.latencyMs === "number", `${probe.latencyMs} ms`);

  // 0. MCP OAuth (ai/docs/MCP-OAUTH.md) on the real tables; independent of the chat checks below.
  const personal = (await (await call("POST", "/api/assistant/tokens", { name: "personal", scope: "read" })).json()) as { token: string };
  await oauthChecks(personal.token);

  // 1. A read tool.
  const read = await stream("/api/assistant/conversations", { content: "What's on the shopping list?" });
  const start1 = read.find((event) => event.type === "start");
  const conversationId = String(start1?.conversationId ?? "");
  check("read: tool ran", read.some((event) => event.type === "tool" && event.name === "shopping.list" && event.status === "done"));
  check("read: streamed answer", textOf(read).startsWith("Done:"), textOf(read).slice(0, 60));
  check("read: done", read.at(-1)?.type === "done" && read.at(-1)?.status === "done");

  // 2. A write with confirmation.
  const write = await stream(`/api/assistant/conversations/${conversationId}/messages`, { content: "add oat milk" });
  const confirm = write.find((event) => event.type === "confirm");
  check("write: paused for confirmation", write.at(-1)?.status === "paused" && Boolean(confirm), String(confirm?.summary ?? ""));
  let items = (await (await call("GET", "/api/shopping/items")).json()) as { name: string }[];
  check("write: nothing changed before confirming", !items.some((item) => item.name === "oat milk"));
  const confirmed = await stream(`/api/assistant/conversations/${conversationId}/confirmations/${String(confirm?.messageId)}`, { decision: "confirm", remember: false });
  check("write: tool ran after confirm", confirmed.some((event) => event.type === "tool" && event.status === "done"));
  check("write: answer after confirm", textOf(confirmed).startsWith("Done:"), textOf(confirmed).slice(0, 60));
  items = (await (await call("GET", "/api/shopping/items")).json()) as { name: string }[];
  check("write: item is on the list", items.some((item) => item.name === "oat milk"));
  const again = await call("POST", `/api/assistant/conversations/${conversationId}/confirmations/${String(confirm?.messageId)}`, { decision: "confirm" });
  check("write: a confirmation can't be used twice", again.status === 404, String(again.status));

  // 3. A sensitive write, cancelled.
  const spent = await stream(`/api/assistant/conversations/${conversationId}/messages`, { content: "I spent 12.50 at Delhaize" });
  const spentConfirm = spent.find((event) => event.type === "confirm");
  check("sensitive: asks, without 'don't ask again'", Boolean(spentConfirm) && spentConfirm?.allowRemember === false && spentConfirm?.permission === "sensitive", String(spentConfirm?.summary ?? ""));
  const cancelled = await stream(`/api/assistant/conversations/${conversationId}/confirmations/${String(spentConfirm?.messageId)}`, { decision: "cancel" });
  check("sensitive: cancel tells the model", textOf(cancelled) === "OK, nothing changed.", textOf(cancelled));
  const expenses = (await (await call("GET", "/api/expenses")).json()) as { expenses?: unknown[]; items?: unknown[] };
  check("sensitive: no expense created", JSON.stringify(expenses).includes("Delhaize") === false);

  // 4. Refusal: asking to disarm gets an answer, never a disarm tool.
  const refusal = await stream(`/api/assistant/conversations/${conversationId}/messages`, { content: "Please disarm the alarm" });
  check("refusal: plain answer, no tool", !refusal.some((event) => event.type === "tool" || event.type === "confirm") && textOf(refusal).length > 0);
  const offered = (await (await fetch(`http://127.0.0.1:${FAKE_PORT}/requests`)).json()) as string[][];
  check("refusal: no disarm tool ever offered to the model", offered.length > 0 && offered.every((names) => !names.some((name) => /disarm|unlock/i.test(name))), `${offered.at(-1)?.length ?? 0} tools offered`);

  // 5. Conversations.
  const list = (await (await call("GET", "/api/assistant/conversations")).json()) as { id: string; title: string }[];
  check("conversations listed with a title", list.length === 1 && list[0]?.title === "What's on the shopping list?", list[0]?.title);
  const detail = (await (await call("GET", `/api/assistant/conversations/${conversationId}`)).json()) as { messages: { role: string; tool: { status: string } | null }[] };
  check("conversation detail has tool messages", detail.messages.some((message) => message.tool?.status === "cancelled"));
  const renamed = await call("PATCH", `/api/assistant/conversations/${conversationId}`, { title: "Renamed" });
  check("rename", renamed.ok);

  // 6. MCP.
  const anonymous = await mcp(null, "tools/list");
  check("mcp: 401 without a token", anonymous.status === 401);
  const readToken = (await (await call("POST", "/api/assistant/tokens", { name: "read", scope: "read" })).json()) as { token: string };
  const writeToken = (await (await call("POST", "/api/assistant/tokens", { name: "write", scope: "write" })).json()) as { token: string; id: string };
  const init = await mcp(readToken.token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  check("mcp: initialize", (init.body?.result as { protocolVersion?: string } | undefined)?.protocolVersion === "2025-06-18");
  const readList = await mcp(readToken.token, "tools/list");
  const readNames = ((readList.body?.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
  check("mcp: read token lists only reads", readNames.includes("shopping_list") && !readNames.includes("shopping_add_item"), `${readNames.length} tools`);
  const readCall = await mcp(readToken.token, "tools/call", { name: "shopping_list", arguments: {} });
  check("mcp: read call", (readCall.body?.result as { isError?: boolean } | undefined)?.isError === false && JSON.stringify(readCall.body).includes("oat milk"));
  const unconfirmed = await mcp(writeToken.token, "tools/call", { name: "shopping_add_item", arguments: { name: "via mcp" } });
  check("mcp: write without confirm does nothing", (unconfirmed.body?.result as { isError?: boolean } | undefined)?.isError === true);
  const confirmedCall = await mcp(writeToken.token, "tools/call", { name: "shopping_add_item", arguments: { name: "via mcp", confirm: true } });
  check("mcp: write with confirm: true", (confirmedCall.body?.result as { isError?: boolean } | undefined)?.isError === false);
  items = (await (await call("GET", "/api/shopping/items")).json()) as { name: string }[];
  check("mcp: exactly one item added", items.filter((item) => item.name === "via mcp").length === 1);
  await call("DELETE", `/api/assistant/tokens/${writeToken.id}`);
  const revoked = await mcp(writeToken.token, "tools/list");
  check("mcp: revoked token refused", revoked.status === 401);

  const removed = await call("DELETE", `/api/assistant/conversations/${conversationId}`);
  check("delete conversation", removed.status === 204);
}

const CALLBACK = "https://chatgpt.com/connector/oauth/check";
const VERIFIER = "runtime-check-verifier-0123456789-abcdefghijklmnop";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${APP}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
const asJson = async (response: Response) => (await response.json().catch(() => ({}))) as Record<string, unknown>;

/** Authorize → consent (the signed-in owner) → allow → the code. */
async function oauthCode(clientId: string, redirectUri = CALLBACK): Promise<string> {
  const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: CHALLENGE, code_challenge_method: "S256", state: "s1", scope: "read write", resource: `${APP}/api/mcp` });
  const started = await fetch(`${APP}/oauth/authorize?${query}`, { redirect: "manual" });
  const requestId = (started.headers.get("location") ?? "").replace("/connect/", "");
  const consent = (await (await call("GET", `/api/assistant/oauth/requests/${requestId}`)).json()) as { csrf: string };
  const decided = (await (await call("POST", `/api/assistant/oauth/requests/${requestId}`, { decision: "allow", scope: "write", csrf: consent.csrf })).json()) as { redirectTo: string };
  return new URL(decided.redirectTo).searchParams.get("code") ?? "";
}

async function oauthChecks(personalToken: string) {
  const prm = await asJson(await fetch(`${APP}/.well-known/oauth-protected-resource/api/mcp`));
  check("oauth: protected resource metadata", prm.resource === `${APP}/api/mcp`);
  const asm = await asJson(await fetch(`${APP}/.well-known/oauth-authorization-server`));
  check("oauth: authorization server metadata", asm.issuer === APP && asm.registration_endpoint === `${APP}/oauth/register`);
  const unauthorized = await fetch(`${APP}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("oauth: 401 points to the metadata", (unauthorized.headers.get("www-authenticate") ?? "").includes(`resource_metadata="${APP}/.well-known/oauth-protected-resource"`));

  const rejected = await fetch(`${APP}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) });
  check("oauth: DCR rejects other hosts", (await asJson(rejected)).error === "invalid_redirect_uri");
  const registered = await asJson(
    await fetch(`${APP}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }) }),
  );
  const clientId = String(registered.client_id ?? "");
  check("oauth: DCR registers chatgpt.com", clientId.startsWith("wh_client_"));

  const code = await oauthCode(clientId);
  const exchange = () => form("/oauth/token", { grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: CALLBACK, resource: `${APP}/api/mcp` });
  const tokens = await asJson(await exchange());
  const access = String(tokens.access_token ?? "");
  check("oauth: code exchanged", access.startsWith("wh_at_") && tokens.scope === "read write");
  const list = await mcp(access, "tools/list");
  check("oauth: access token lists write tools", JSON.stringify(list.body).includes("shopping_add_item"));
  const added = await mcp(access, "tools/call", { name: "shopping_add_item", arguments: { name: "via oauth", confirm: true } });
  check("oauth: write with confirm: true", (added.body?.result as { isError?: boolean } | undefined)?.isError === false);
  const audit = await (await call("GET", "/api/audit")).text();
  check("oauth: audit names the app", audit.includes("Rob · ChatGPT"));
  const replay = await asJson(await exchange());
  check("oauth: code replay refused", replay.error === "invalid_grant");
  check("oauth: replay revoked the grant", (await mcp(access, "ping")).status === 401);

  const second = await asJson(await form("/oauth/token", { grant_type: "authorization_code", client_id: clientId, code: await oauthCode(clientId), code_verifier: VERIFIER, redirect_uri: CALLBACK }));
  const rotated = await asJson(await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: String(second.refresh_token) }));
  check("oauth: refresh rotates", String(rotated.refresh_token ?? "").startsWith("wh_rt_") && rotated.refresh_token !== second.refresh_token);
  const reused = await asJson(await form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: String(second.refresh_token) }));
  check("oauth: refresh reuse refused", reused.error === "invalid_grant");
  check("oauth: reuse revoked the grant", (await mcp(String(rotated.access_token), "ping")).status === 401);

  const third = await asJson(await form("/oauth/token", { grant_type: "authorization_code", client_id: clientId, code: await oauthCode(clientId), code_verifier: VERIFIER, redirect_uri: CALLBACK }));
  const overview = (await (await call("GET", "/api/assistant/oauth")).json()) as { connected: { id: string; redirectHost: string }[] };
  check("oauth: connected apps listed", overview.connected.length === 1 && overview.connected[0]?.redirectHost === "chatgpt.com", `${overview.connected.length}`);
  await call("DELETE", `/api/assistant/oauth/connected/${overview.connected[0]?.id}`);
  check("oauth: disconnected token refused", (await mcp(String(third.access_token), "ping")).status === 401);

  await call("PATCH", "/api/assistant/oauth/settings", { dcrEnabled: false });
  const off = await fetch(`${APP}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [CALLBACK] }) });
  check("oauth: DCR off hides registration", off.status === 404 && !("registration_endpoint" in (await asJson(await fetch(`${APP}/.well-known/oauth-authorization-server`)))));
  check("oauth: personal token works with DCR off", (await mcp(personalToken, "ping")).status === 200);

  const app = (await (await call("POST", "/api/assistant/oauth/apps", { name: "Agent", redirectUris: "https://agent.example/cb", confidential: true })).json()) as { clientId: string; clientSecret: string };
  const appCode = await oauthCode(app.clientId, "https://agent.example/cb");
  const basic = `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;
  const appTokens = await asJson(await form("/oauth/token", { grant_type: "authorization_code", code: appCode, code_verifier: VERIFIER, redirect_uri: "https://agent.example/cb" }, { Authorization: basic }));
  check("oauth: manual app with secret", String(appTokens.access_token ?? "").startsWith("wh_at_"));

  await call("POST", "/api/jobs/assistant.oauth-cleanup/run");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const runs = (await (await call("GET", "/api/jobs/assistant.oauth-cleanup/runs")).json()) as { status: string; error?: string | null }[];
  check("oauth: cleanup job succeeds", runs[0]?.status === "succeeded", JSON.stringify(runs[0] ?? null).slice(0, 200));
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(async () => {
    for (const child of children) child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).then(
      () => console.log(`dropped ${DB}`),
      (error: unknown) => console.log(`could not drop ${DB}: ${String(error)}`),
    );
    console.log(failures ? `${failures} check(s) failed` : "all checks passed");
    process.exit(failures ? 1 : 0);
  });
