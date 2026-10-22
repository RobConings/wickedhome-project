import { z } from "zod";

/**
 * OAuth 2.1 for the MCP server (ai/docs/MCP-OAUTH.md): the contract between the Assistant card, the consent
 * page and `/api/assistant/oauth`. The OAuth endpoints themselves (`/oauth/*`, `/.well-known/*`) speak the
 * RFCs' own JSON and live in ai/core/mcp-oauth*.ts.
 */

/** Same meaning as the personal token scopes: `write` also reads. */
export const MCP_OAUTH_SCOPES = ["read", "write"] as const;
export type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number];

/** Redirect hosts a dynamically registered client may use until an owner changes the list. */
export const MCP_OAUTH_DEFAULT_HOSTS = ["chatgpt.com", "claude.ai"] as const;

export const MCP_OAUTH_MAX_HOSTS = 20;
export const MCP_OAUTH_MAX_REDIRECT_URIS = 5;

/** An exact host name: letters, digits and hyphens per label, at least one dot (no ports, no wildcards). */
const HOST_NAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
export const isHostName = (value: string) => HOST_NAME.test(value);

/**
 * A redirect URI an OAuth client may use: https, no user info, no fragment. With `allowedHosts`, only those
 * exact hosts on the default port (dynamic registration); without it any host (an owner's manual app).
 * Returns the host, or null when the URI is not acceptable.
 */
export function redirectUriHost(uri: string, allowedHosts?: readonly string[]): string | null {
  if (uri.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || uri.includes("#")) return null;
  const host = url.hostname.toLowerCase();
  if (allowedHosts && (url.port !== "" || !allowedHosts.includes(host))) return null;
  return host;
}

/** One value per line (or separated by commas/spaces), trimmed, without empties and duplicates. */
export const splitLines = (value: unknown): string[] =>
  typeof value === "string" ? [...new Set(value.split(/[\s,]+/).map((line) => line.trim()).filter(Boolean))] : Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

// ── What the card shows ───────────────────────────────────────────────────────────────────────────────

/** One person's consent for one app ("Connected apps"). */
export type McpConnectedApp = {
  id: string;
  clientName: string;
  /** Where its tokens go, e.g. `chatgpt.com`. */
  redirectHost: string;
  kind: "dynamic" | "manual";
  scope: McpOAuthScope;
  userId: string;
  person: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type McpOAuthSettings = {
  dcrEnabled: boolean;
  allowedHosts: string[];
};

/** An owner's manual OAuth app (never its secret). */
export type McpOAuthApp = {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  /** Has a client secret (confidential client); otherwise PKCE only. */
  confidential: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

/** `POST /api/assistant/oauth/apps`: the secret is in this answer only, once. */
export type CreatedMcpOAuthApp = McpOAuthApp & { clientSecret: string | null };

/** `GET /api/assistant/oauth`: everything the card's OAuth part needs; `settings`/`apps` for owners only. */
export type McpOAuthOverview = {
  /** The URL to give ChatGPT/Claude. */
  serverUrl: string;
  connected: McpConnectedApp[];
  settings: McpOAuthSettings | null;
  apps: McpOAuthApp[] | null;
};

/** `GET /api/assistant/oauth/requests/:id`: the consent page. */
export type McpOAuthConsent = {
  clientName: string;
  kind: "dynamic" | "manual";
  /** Where the tokens will go, shown prominently. */
  redirectHost: string;
  /** What the client asked for; the person may give less (only read). */
  requestedScopes: McpOAuthScope[];
  /** Why this person can't allow it: children never can. */
  refused: "child" | null;
  /** Goes back with the decision. */
  csrf: string;
  expiresAt: string;
};

/** `POST /api/assistant/oauth/requests/:id`: the browser goes on to `redirectTo` (the app's redirect URI). */
export type McpOAuthDecisionResult = { redirectTo: string };

// ── Input schemas ─────────────────────────────────────────────────────────────────────────────────────

export const mcpOAuthDecisionInputSchema = z.object({
  decision: z.enum(["allow", "deny"]),
  scope: z.enum(MCP_OAUTH_SCOPES).default("read"),
  csrf: z.string().min(1).max(200),
});
export type McpOAuthDecisionInput = z.infer<typeof mcpOAuthDecisionInputSchema>;

export const mcpOAuthSettingsInputSchema = z.object({
  dcrEnabled: z.boolean().optional(),
  allowedHosts: z
    .preprocess(
      (value) => [...new Set(splitLines(value).map((host) => host.toLowerCase()))],
      z
        .array(z.string())
        .max(MCP_OAUTH_MAX_HOSTS, { message: "tooManyHosts" })
        .refine((hosts) => hosts.every(isHostName), { message: "invalidHost" }),
    )
    .optional(),
});
export type McpOAuthSettingsInput = z.infer<typeof mcpOAuthSettingsInputSchema>;

/** The manual OAuth app form: redirect URIs one per line. */
export const mcpOAuthAppInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  redirectUris: z.preprocess(
    splitLines,
    z
      .array(z.string())
      .min(1, { message: "redirectUriRequired" })
      .max(MCP_OAUTH_MAX_REDIRECT_URIS, { message: "tooManyRedirectUris" })
      // One message on the field itself (not per line), so the form shows it under the text area.
      .refine((uris) => uris.every((uri) => redirectUriHost(uri) !== null), { message: "invalidRedirectUri" }),
  ),
  /** Make a client secret (the app keeps it on its server); without it the app uses PKCE only. A switch posts "on" or nothing. */
  confidential: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()),
});
export type McpOAuthAppInput = z.infer<typeof mcpOAuthAppInputSchema>;
