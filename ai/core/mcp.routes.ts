import express, { Router, type Request, type Response } from "express";
import { createRateLimiter, RateLimitError } from "@/api/lib/rate-limit";
import { prepareInput, runTool } from "./assistant-loop";
import { skillsForRole } from "./skills";
import "./tool-audit";
import { authenticateToken, type TokenIdentity } from "./assistant.service";
import { mcpOAuth } from "./mcp-oauth.store";
import { describeCall, getAssistantToolByWireName, toolInputJsonSchema, toolsFor, type AssistantToolContext, type RegisteredAssistantTool } from "./tools";

/**
 * The MCP server: the assistant's tool registry over the Model Context Protocol, for other assistants on the
 * LAN (Claude Desktop, LM Studio's MCP client, Home Assistant…). Streamable HTTP transport, the stateless
 * subset: every request is one JSON-RPC message in a POST and gets one JSON answer (no server-initiated
 * stream, so GET answers 405, as the spec allows). Implemented by hand (initialize, ping, tools/list,
 * tools/call) instead of the SDK: four methods don't justify a dependency, and it keeps the esbuild server
 * bundle simple. See ai/docs/ASSISTANT.md.
 *
 * Auth, two equal ways: `Authorization: Bearer wh_mcp_…`, a personal token made under Assistant → MCP, or an
 * OAuth access token (`wh_at_…`, ChatGPT/Claude connectors; ai/docs/MCP-OAUTH.md). Same tools, roles, scope
 * meaning and household as the person either way. A 401 points to the OAuth metadata (RFC 9728). Confirmations: a READ token only sees read tools; a WRITE token also sees writes,
 * and every write call must carry `confirm: true`, sent only after the human confirmed in their own client.
 * Without it the call changes nothing and answers what would happen.
 *
 * Mounted before the CSRF header check: MCP clients don't send `X-WickedHome`, and there is no cookie.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const SERVER_INFO = { name: "wickedhome", title: "WickedHome", version: "1.0.0" };

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

const rpcError = (id: JsonRpcId, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } });
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });

/** Browsers send an Origin; MCP clients usually don't. A foreign one is refused (DNS-rebinding guard). */
function originAllowed(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === req.get("host") || host === req.get("x-forwarded-host");
  } catch {
    return false;
  }
}

/** The argument that says the human confirmed this write, added to every write tool's schema over MCP. */
const CONFIRM_PROPERTY = {
  type: "boolean",
  description: "Set to true only after the human explicitly confirmed this exact action. Without it nothing is changed and you get a description of what would happen.",
};

export function mcpToolOf(tool: RegisteredAssistantTool) {
  const inputSchema = toolInputJsonSchema(tool);
  if (tool.permission !== "read") {
    inputSchema.properties = { ...(inputSchema.properties as Record<string, unknown>), confirm: CONFIRM_PROPERTY };
  }
  return {
    name: tool.wireName,
    title: tool.activity.en,
    description: tool.permission === "read" ? tool.description : `${tool.description} Changes household data: needs confirm: true after the human agreed.`,
    inputSchema,
    annotations: { readOnlyHint: tool.permission === "read", destructiveHint: tool.permission === "sensitive", openWorldHint: false },
  };
}

const textResult = (text: string, isError: boolean, structured?: unknown) => ({
  content: [{ type: "text", text }],
  ...(structured !== undefined && { structuredContent: structured }),
  isError,
});

/** `tools/call`: same validation, roles and services as the chat; writes need `confirm: true`. */
export async function callMcpTool(identity: TokenIdentity, params: Record<string, unknown> | undefined, signal: AbortSignal) {
  const name = typeof params?.name === "string" ? params.name : "";
  const tool = getAssistantToolByWireName(name);
  const allowed = tool && toolsFor(identity.user.role, { readOnly: identity.scope === "read" }).some((candidate) => candidate.name === tool.name);
  if (!tool || !allowed) return { error: { code: -32602, message: `Unknown tool: ${name}` } };

  const raw = params?.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? { ...(params.arguments as Record<string, unknown>) } : {};
  const confirmed = raw.confirm === true;
  delete raw.confirm;
  const ctx: AssistantToolContext = {
    user: identity.user,
    householdId: identity.user.householdId,
    locale: identity.user.locale,
    signal,
    channel: "mcp",
    ...(identity.via && { via: identity.via }),
  };

  if (tool.permission !== "read" && !confirmed) {
    // Validate and resolve names first, so the human is asked about "Clara", not about an unknown name.
    const input = await prepareInput(tool, ctx, raw);
    if (!input.ok) return { result: textResult(input.error, true) };
    const summary = await describeCall(tool, ctx, input.data);
    return {
      result: textResult(
        `Not done yet: this changes household data and needs the human's confirmation. It would: ${summary}. Ask the human; only if they agree, call ${tool.wireName} again with the same arguments and "confirm": true.`,
        true,
      ),
    };
  }
  const outcome = await runTool(tool, ctx, raw);
  return outcome.ok
    ? { result: textResult(JSON.stringify(outcome.data ?? null), false, outcome.data && typeof outcome.data === "object" && !Array.isArray(outcome.data) ? outcome.data : undefined) }
    : { result: textResult(outcome.error, true) };
}

/** One JSON-RPC request → its response (exported for tests). */
export async function handleMcpMessage(message: JsonRpcRequest, identity: TokenIdentity, signal: AbortSignal) {
  const id = message.id ?? null;
  switch (message.method) {
    case "initialize": {
      const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: [
          `WickedHome, the home-management app of the ${identity.user.householdName} household (Belgium, Europe/Brussels). You act as ${identity.user.name}. Dates are YYYY-MM-DD.`,
          `Tools that change data need "confirm": true, only after the human agreed. Arguments naming people, rooms, payees… take names; use search_everything to find things.`,
          `For recipe bulk imports use recipes_import_batch (up to 25 recipes per call). Existing sourceUrl matches only receive the supplied category; content is preserved. On HTTP 429 wait the Retry-After seconds before retrying.`,
          `Areas: ${skillsForRole(identity.user.role).map((skill) => `${skill.id} (${skill.summary})`).join("; ")}`,
        ].join("\n"),
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: toolsFor(identity.user.role, { readOnly: identity.scope === "read" }).map(mcpToolOf) });
    case "tools/call": {
      const outcome = await callMcpTool(identity, message.params, signal);
      return "error" in outcome && outcome.error ? rpcError(id, outcome.error.code, outcome.error.message) : rpcResult(id, outcome.result);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

type Authenticate = (token: string) => Promise<TokenIdentity | null>;

/**
 * A personal token (`wh_mcp_`) goes to the personal tokens, anything else to OAuth. Personal tokens never
 * depend on the OAuth settings: switching DCR off doesn't touch them.
 */
export const createMcpAuthenticator =
  (personal: Authenticate, oauth: { authenticateAccessToken: Authenticate }): Authenticate =>
  (token) =>
    token.startsWith("wh_mcp_") ? personal(token) : oauth.authenticateAccessToken(token);

export const authenticateMcpToken = createMcpAuthenticator(authenticateToken, mcpOAuth);

type McpRouterOptions = {
  authenticate?: Authenticate;
  /** The protected resource metadata URL in the 401's `WWW-Authenticate`. */
  resourceMetadataUrl?: string;
  /** Override limits/clock for deterministic HTTP tests. Production uses MCP_LIMITS. */
  limits?: Partial<typeof MCP_LIMITS>;
  now?: () => number;
};

export const MCP_LIMITS = {
  requests: 240,
  windowMs: 60_000,
  concurrentTools: 4,
  failedAuthentication: 30,
  failedAuthenticationWindowMs: 15 * 60_000,
};

/** The router (a factory, so tests can pass their own authenticator). */
export function createMcpRouter({ authenticate = authenticateMcpToken, resourceMetadataUrl = mcpOAuth.urls.resourceMetadata, limits: overrides, now }: McpRouterOptions = {}) {
  const limits = { ...MCP_LIMITS, ...overrides };
  // Per person: OAuth refreshes do not reset the budget; people behind the same proxy have separate budgets.
  const callsPerUser = createRateLimiter({ limit: limits.requests, windowMs: limits.windowMs, now });
  const failuresPerIp = createRateLimiter({ limit: limits.failedAuthentication, windowMs: limits.failedAuthenticationWindowMs, now });
  const activeTools = new Map<string, number>();
  const router = Router();
  router.use(express.json({ limit: "2mb" }));

  function unauthorized(res: Response, presented: boolean) {
    const error = presented ? ', error="invalid_token"' : "";
    res.setHeader("WWW-Authenticate", `Bearer realm="wickedhome-mcp", resource_metadata="${resourceMetadataUrl}"${error}`);
    res.status(401).json(rpcError(null, -32001, "Missing or invalid access token"));
  }

  router.post("/", async (req, res) => {
    if (!originAllowed(req)) {
      res.status(403).json(rpcError(null, -32000, "Origin not allowed"));
      return;
    }
    const header = req.get("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const identity = token ? await authenticate(token) : null;
    if (!identity) {
      failuresPerIp.hit(req.ip ?? "unknown");
      unauthorized(res, token !== "");
      return;
    }
    const version = req.get("mcp-protocol-version");
    if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
      res.status(400).json(rpcError(null, -32600, `Unsupported MCP protocol version ${version}`));
      return;
    }
    const userKey = `${identity.user.householdId}:${identity.user.id}`;
    callsPerUser.hit(userKey);

    const body = req.body as unknown;
    if (Array.isArray(body)) {
      res.status(400).json(rpcError(null, -32600, "Batches are not supported"));
      return;
    }
    const message = body as Partial<JsonRpcRequest> | null;
    if (!message || message.jsonrpc !== "2.0") {
      res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC message"));
      return;
    }
    // Notifications (no id) and responses get 202 without a body.
    if (typeof message.method !== "string" || message.id === undefined) {
      res.status(202).end();
      return;
    }
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    const isTool = message.method === "tools/call";
    const active = activeTools.get(userKey) ?? 0;
    if (isTool && active >= limits.concurrentTools) {
      res.setHeader("Retry-After", "1");
      res.status(429).json(rpcError(message.id ?? null, -32029, "Too many concurrent tool calls; retry after 1 second", { retryAfterSeconds: 1, concurrentTools: limits.concurrentTools }));
      return;
    }
    if (isTool) activeTools.set(userKey, active + 1);
    try {
      res.json(await handleMcpMessage(message as JsonRpcRequest, identity, controller.signal));
    } finally {
      if (isTool) {
        const remaining = (activeTools.get(userKey) ?? 1) - 1;
        if (remaining) activeTools.set(userKey, remaining);
        else activeTools.delete(userKey);
      }
    }
  });

  // No server-initiated stream and no sessions to end.
  router.get("/", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).end();
  });
  router.delete("/", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).end();
  });

  /** Malformed JSON bodies: a JSON-RPC parse error instead of the app's error shape. */
  router.use((err: unknown, req: Request, res: Response, next: (error?: unknown) => void) => {
    const requestId = !Array.isArray(req.body) && (typeof req.body?.id === "string" || typeof req.body?.id === "number") ? req.body.id as JsonRpcId : null;
    if (err instanceof RateLimitError) {
      res.setHeader("Retry-After", String(err.retryAfter));
      res.status(429).json(rpcError(requestId, -32029, `Rate limit reached; retry after ${err.retryAfter} seconds`, { retryAfterSeconds: err.retryAfter, limit: err.limit, windowMs: err.windowMs }));
      return;
    }
    if ((err as { type?: string })?.type === "entity.too.large") {
      res.status(413).json(rpcError(null, -32600, "MCP request exceeds 2 MB; send a smaller recipe batch"));
      return;
    }
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json(rpcError(null, -32700, "Parse error"));
      return;
    }
    next(err);
  });
  return router;
}

export const mcpRouter = createMcpRouter();
