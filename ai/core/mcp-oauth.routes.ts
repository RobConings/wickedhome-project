import express, { Router, type Request, type RequestHandler, type Response } from "express";
import { mcpOAuthAppInputSchema, mcpOAuthDecisionInputSchema, mcpOAuthSettingsInputSchema } from "@/features/assistant/types/mcp-oauth";
import { idSchema } from "@/types/common";
import { appActor, audit } from "@/api/audit/audit.service";
import { HttpError, parse } from "@/api/lib/http";
import { createRateLimiter } from "@/api/lib/rate-limit";
import { currentUser, requireRole } from "@/api/lib/session";
import { OAuthError, authorizationServerMetadata, protectedResourceMetadata, type McpOAuth } from "./mcp-oauth";
import { mcpOAuth } from "./mcp-oauth.store";
import "./mcp-oauth.jobs";

/**
 * HTTP for the MCP OAuth server (ai/docs/MCP-OAUTH.md):
 * - `/.well-known/oauth-protected-resource[/api/mcp]` and `/.well-known/oauth-authorization-server` (public, CORS)
 * - `/oauth/authorize` (browser → consent page), `/oauth/token`, `/oauth/register`, `/oauth/revoke` (RFC JSON errors)
 * - `/api/assistant/oauth/*`: the consent page and the Assistant card (session, CSRF header, household-scoped)
 *
 * The first two are mounted on the app itself by src/api/app.ts, outside `/api`: OAuth clients send no
 * `X-WickedHome` header and no cookie. Built by a factory so the tests can pass an in-memory store.
 */

/** Discovery and the token endpoints may be called from a browser-based MCP client: no cookies are involved. */
const cors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version");
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }
  next();
};

const noStore = (res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The only page `/oauth/authorize` renders itself: when the redirect URI can't be trusted with an error. */
function errorPage(res: Response, status: number, message: string) {
  noStore(res);
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WickedHome</title>` +
        `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}</style></head>` +
        `<body><h1>WickedHome</h1><p>This connection request can't be completed. / Deze koppelingsaanvraag kan niet verder.</p><p><code>${escapeHtml(message)}</code></p></body></html>`,
    );
}

const DEFAULT_LIMITS = { registerPerIp: 10, registerGlobal: 100, tokenPerIp: 120, authorizePerIp: 60 };

export function createMcpOAuthRoutes(oauth: McpOAuth, { limits = DEFAULT_LIMITS, record = audit }: { limits?: typeof DEFAULT_LIMITS; record?: typeof audit } = {}) {
  const registerPerIp = createRateLimiter({ limit: limits.registerPerIp, windowMs: 60 * 60_000 });
  const registerGlobal = createRateLimiter({ limit: limits.registerGlobal, windowMs: 60 * 60_000 });
  const tokenPerIp = createRateLimiter({ limit: limits.tokenPerIp, windowMs: 15 * 60_000 });
  const authorizePerIp = createRateLimiter({ limit: limits.authorizePerIp, windowMs: 15 * 60_000 });
  const ip = (req: Request) => req.ip ?? "unknown";

  // ── /.well-known ──
  const wellKnownRouter = Router();
  wellKnownRouter.use(cors);
  const resourceMetadata: RequestHandler = (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(protectedResourceMetadata(oauth.urls));
  };
  wellKnownRouter.get("/oauth-protected-resource", resourceMetadata);
  wellKnownRouter.get("/oauth-protected-resource/api/mcp", resourceMetadata);
  wellKnownRouter.get("/oauth-authorization-server", async (_req, res) => {
    // Not cached long: switching DCR off removes the registration endpoint.
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(authorizationServerMetadata(oauth.urls, (await oauth.readSettings()).dcrEnabled));
  });
  // Anything else here (e.g. openid-configuration: this is not an OpenID provider) is a JSON 404, never the
  // SPA's index.html, so clients that probe several documents fall back cleanly.
  wellKnownRouter.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // ── /oauth ──
  const oauthRouter = Router();
  oauthRouter.use(express.urlencoded({ extended: false, limit: "16kb" }), express.json({ limit: "16kb" }));

  oauthRouter.get("/authorize", async (req, res) => {
    authorizePerIp.hit(ip(req));
    const outcome = await oauth.authorize(req.query as Record<string, unknown>);
    if (outcome.type === "page") {
      errorPage(res, outcome.status, outcome.message);
      return;
    }
    noStore(res);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(302, outcome.location);
  });

  oauthRouter.use(["/register", "/token", "/revoke"], cors);

  oauthRouter.post("/register", async (req, res) => {
    // Off means the endpoint isn't there (and not advertised); existing clients keep working.
    if (!(await oauth.readSettings()).dcrEnabled) {
      res.status(404).json({ error: "invalid_request", error_description: "Dynamic client registration is off" });
      return;
    }
    registerPerIp.hit(ip(req));
    registerGlobal.hit("all");
    noStore(res);
    res.status(201).json(await oauth.register(req.body));
  });

  oauthRouter.post("/token", async (req, res) => {
    tokenPerIp.hit(ip(req));
    noStore(res);
    res.json(await oauth.token((req.body ?? {}) as Record<string, unknown>, req.get("authorization")));
  });

  oauthRouter.post("/revoke", async (req, res) => {
    tokenPerIp.hit(ip(req));
    noStore(res);
    await oauth.revoke((req.body ?? {}) as Record<string, unknown>, req.get("authorization"));
    res.status(200).end();
  });

  oauthRouter.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  /** RFC 6749 §5.2 JSON for every error of these endpoints, never the app's error shape. */
  oauthRouter.use((err: unknown, _req: Request, res: Response, next: (error?: unknown) => void) => {
    if (res.headersSent) return next(err);
    noStore(res);
    if (err instanceof OAuthError) {
      for (const [name, value] of Object.entries(err.headers)) res.setHeader(name, value);
      res.status(err.status).json(err.body);
      return;
    }
    if (err instanceof HttpError && err.status === 429) {
      res.status(429).json({ error: "temporarily_unavailable", error_description: "Too many requests, try again later" });
      return;
    }
    if ((err as { type?: string })?.type === "entity.parse.failed" || (err as { type?: string })?.type === "entity.too.large") {
      res.status(400).json({ error: "invalid_request", error_description: "Malformed request body" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "server_error", error_description: "Something went wrong" });
  });

  // ── /api/assistant/oauth (session) ──
  const manageRouter = Router();
  const requestId = (req: Request) => parse(idSchema, req.params.id);

  manageRouter.get("/", async (req, res) => {
    res.json(await oauth.overview(currentUser(req)));
  });

  manageRouter.delete("/connected/:id", async (req, res) => {
    const user = currentUser(req);
    const id = requestId(req);
    const name = await oauth.disconnect(user, id);
    await record(appActor(user), { action: "assistant.oauth_disconnected", targetType: "mcp_oauth_grant", targetId: id, targetLabel: name });
    res.status(204).end();
  });

  manageRouter.patch("/settings", requireRole("owner"), async (req, res) => {
    const user = currentUser(req);
    const settings = await oauth.updateSettings(user, parse(mcpOAuthSettingsInputSchema, req.body));
    await record(appActor(user), {
      action: "assistant.oauth_settings",
      targetType: "mcp_oauth_settings",
      summary: `DCR ${settings.dcrEnabled ? "on" : "off"}; ${settings.allowedHosts.join(", ") || "-"}`,
    });
    res.json(settings);
  });

  manageRouter.post("/apps", requireRole("owner"), async (req, res) => {
    const user = currentUser(req);
    const app = await oauth.createApp(user, parse(mcpOAuthAppInputSchema, req.body));
    await record(appActor(user), { action: "assistant.oauth_app_created", targetType: "mcp_oauth_app", targetId: app.id, targetLabel: app.name });
    res.status(201).json(app);
  });

  manageRouter.delete("/apps/:id", requireRole("owner"), async (req, res) => {
    const user = currentUser(req);
    const id = requestId(req);
    await oauth.deleteApp(user, id);
    await record(appActor(user), { action: "assistant.oauth_app_deleted", targetType: "mcp_oauth_app", targetId: id });
    res.status(204).end();
  });

  // The consent page. Its id is a 43-character random string, not a cuid.
  const consentId = (req: Request) => {
    const id = String(req.params.id ?? "");
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw new HttpError(404, "not_found", "This request expired");
    return id;
  };

  manageRouter.get("/requests/:id", async (req, res) => {
    noStore(res);
    res.json(await oauth.consent(currentUser(req), consentId(req)));
  });

  manageRouter.post("/requests/:id", async (req, res) => {
    const user = currentUser(req);
    const { redirectTo, clientName, allowed } = await oauth.decide(user, consentId(req), parse(mcpOAuthDecisionInputSchema, req.body));
    if (allowed) {
      await record(appActor(user), { action: "assistant.oauth_connected", targetType: "mcp_oauth_grant", targetLabel: clientName, summary: `${clientName} → ${new URL(redirectTo).host}` });
    }
    noStore(res);
    res.json({ redirectTo });
  });

  return { wellKnownRouter, oauthRouter, manageRouter };
}

export const { wellKnownRouter: mcpWellKnownRouter, oauthRouter: mcpOAuthRouter, manageRouter: mcpOAuthManageRouter } = createMcpOAuthRoutes(mcpOAuth);
