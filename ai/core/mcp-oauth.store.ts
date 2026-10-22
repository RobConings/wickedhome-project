import type { Role } from "@/features/auth/types/auth";
import { MCP_OAUTH_DEFAULT_HOSTS, MCP_OAUTH_SCOPES, redirectUriHost, type McpOAuthScope } from "@/features/assistant/types/mcp-oauth";
import { config } from "@/api/lib/config";
import { db, type McpOAuthClient as ClientRow, type McpOAuthScope as ScopeRow } from "@/api/lib/db";
import {
  TOKEN_AUTH_METHODS,
  createMcpOAuth,
  oauthUrls,
  type ClientRecord,
  type GrantRecord,
  type OAuthStore,
  type TokenRecord,
} from "./mcp-oauth";

/**
 * The OAuth server's tables (prisma/schema/mcp-oauth.prisma) behind `OAuthStore`, and the app's one OAuth
 * server, `mcpOAuth`. Grants and manual apps are always read through the household; dynamic clients belong
 * to no household until a person grants them access.
 */

const SETTINGS_ID = "global";
const DAY_MS = 24 * 60 * 60_000;

const toScope = (row: ScopeRow): McpOAuthScope => (row === "WRITE" ? "write" : "read");
const fromScope = (scope: McpOAuthScope): ScopeRow => (scope === "write" ? "WRITE" : "READ");

const toClient = (row: ClientRow): ClientRecord => ({
  id: row.id,
  clientId: row.clientId,
  kind: row.kind === "MANUAL" ? "manual" : "dynamic",
  name: row.name,
  redirectUris: row.redirectUris,
  secretHash: row.secretHash,
  authMethod: (TOKEN_AUTH_METHODS as readonly string[]).includes(row.tokenEndpointAuthMethod) ? (row.tokenEndpointAuthMethod as ClientRecord["authMethod"]) : "none",
  householdId: row.householdId,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

const toGrant = (row: Omit<GrantRecord, "scope"> & { scope: ScopeRow }): GrantRecord => ({ ...row, scope: toScope(row.scope) });

const toToken = (row: Omit<TokenRecord, "scope" | "kind"> & { scope: ScopeRow; kind: "ACCESS" | "REFRESH" }): TokenRecord => ({
  ...row,
  kind: row.kind === "REFRESH" ? "refresh" : "access",
  scope: toScope(row.scope),
});

const scopesOf = (values: string[]): McpOAuthScope[] => values.filter((value): value is McpOAuthScope => (MCP_OAUTH_SCOPES as readonly string[]).includes(value));

/** A grant still counts while it isn't revoked and has an unused, unexpired refresh token. */
const liveGrant = (now: Date) => ({ revokedAt: null, tokens: { some: { kind: "REFRESH" as const, usedAt: null, revokedAt: null, expiresAt: { gt: now } } } });

export const prismaOAuthStore: OAuthStore = {
  async readSettings() {
    const row = await db.mcpOAuthSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? { dcrEnabled: row.dcrEnabled, allowedHosts: row.allowedRedirectHosts } : { dcrEnabled: true, allowedHosts: [...MCP_OAUTH_DEFAULT_HOSTS] };
  },
  async writeSettings(settings) {
    const data = { dcrEnabled: settings.dcrEnabled, allowedRedirectHosts: settings.allowedHosts };
    await db.mcpOAuthSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  },

  async createClient(client) {
    const row = await db.mcpOAuthClient.create({
      data: {
        clientId: client.clientId,
        kind: client.kind === "manual" ? "MANUAL" : "DYNAMIC",
        name: client.name,
        redirectUris: client.redirectUris,
        secretHash: client.secretHash,
        tokenEndpointAuthMethod: client.authMethod,
        householdId: client.householdId,
        createdById: client.createdById,
      },
    });
    return toClient(row);
  },
  async findClient(clientId) {
    const row = await db.mcpOAuthClient.findUnique({ where: { clientId } });
    return row ? toClient(row) : null;
  },
  async findClientById(id) {
    const row = await db.mcpOAuthClient.findUnique({ where: { id } });
    return row ? toClient(row) : null;
  },
  async listManualClients(householdId) {
    const rows = await db.mcpOAuthClient.findMany({ where: { householdId, kind: "MANUAL" }, orderBy: { createdAt: "desc" } });
    return rows.map(toClient);
  },
  async deleteManualClient(id, householdId) {
    const { count } = await db.mcpOAuthClient.deleteMany({ where: { id, householdId, kind: "MANUAL" } });
    return count > 0;
  },
  async touchClient(id, at) {
    await db.mcpOAuthClient.updateMany({ where: { id }, data: { lastUsedAt: at } });
  },

  async createRequest(request) {
    await db.mcpOAuthAuthorizationRequest.create({ data: request });
  },
  async findRequest(id) {
    const row = await db.mcpOAuthAuthorizationRequest.findUnique({ where: { id } });
    return row ? { ...row, scopes: scopesOf(row.scopes) } : null;
  },
  async claimRequest(id, userId, csrfHash) {
    const { count } = await db.mcpOAuthAuthorizationRequest.updateMany({
      where: { id, OR: [{ userId: null }, { userId }] },
      data: { userId, csrfHash },
    });
    return count > 0;
  },
  async deleteRequest(id) {
    const { count } = await db.mcpOAuthAuthorizationRequest.deleteMany({ where: { id } });
    return count > 0;
  },

  async createCode(code) {
    await db.mcpOAuthAuthorizationCode.create({ data: { ...code, scope: fromScope(code.scope) } });
  },
  async findCode(codeHash) {
    const row = await db.mcpOAuthAuthorizationCode.findUnique({ where: { codeHash } });
    return row ? { ...row, scope: toScope(row.scope) } : null;
  },
  async consumeCode(id, at) {
    const { count } = await db.mcpOAuthAuthorizationCode.updateMany({ where: { id, usedAt: null }, data: { usedAt: at } });
    return count > 0;
  },
  async linkCodeToGrant(id, grantId) {
    await db.mcpOAuthAuthorizationCode.update({ where: { id }, data: { grantId } });
  },

  async createGrant(grant) {
    return toGrant(await db.mcpOAuthGrant.create({ data: { ...grant, scope: fromScope(grant.scope) } }));
  },
  async findGrant(id) {
    const row = await db.mcpOAuthGrant.findUnique({ where: { id } });
    return row ? toGrant(row) : null;
  },
  async revokeGrant(id, at) {
    const { count } = await db.mcpOAuthGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
    return count > 0;
  },
  async touchGrant(id, at) {
    await db.mcpOAuthGrant.updateMany({ where: { id }, data: { lastUsedAt: at } });
  },
  async listActiveGrants(householdId, userId, now) {
    const rows = await db.mcpOAuthGrant.findMany({
      where: { householdId, ...(userId && { userId }), ...liveGrant(now) },
      include: { client: true, user: { include: { habitant: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      clientName: row.client.name,
      redirectHost: redirectUriHost(row.client.redirectUris[0] ?? "") ?? "",
      kind: row.client.kind === "MANUAL" ? ("manual" as const) : ("dynamic" as const),
      scope: toScope(row.scope),
      userId: row.userId,
      person: row.user.habitant?.name ?? row.user.email,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async createToken(token) {
    await db.mcpOAuthToken.create({ data: { ...token, kind: token.kind === "refresh" ? "REFRESH" : "ACCESS", scope: fromScope(token.scope) } });
  },
  async findToken(tokenHash) {
    const row = await db.mcpOAuthToken.findUnique({ where: { tokenHash } });
    return row ? toToken(row) : null;
  },
  async useToken(id, at) {
    const { count } = await db.mcpOAuthToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: at } });
    return count > 0;
  },
  async revokeToken(id, at) {
    await db.mcpOAuthToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
  },

  async findUser(id) {
    const user = await db.user.findUnique({ where: { id }, include: { habitant: true, household: true } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.habitant?.name ?? user.email,
      role: user.role.toLowerCase() as Role,
      locale: user.locale === "nl" ? "nl" : "en",
      householdId: user.householdId,
      householdName: user.household.name,
      habitantId: user.habitantId,
      disabled: user.disabledAt !== null,
    };
  },

  async cleanup(now, idleBefore) {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    await db.mcpOAuthAuthorizationRequest.deleteMany({ where: { expiresAt: { lt: now } } });
    // Used codes stay a day, so a replay still finds (and revokes) the grant made from it.
    await db.mcpOAuthAuthorizationCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    // Used refresh tokens stay until they expire, for reuse detection.
    const tokens = await db.mcpOAuthToken.deleteMany({ where: { expiresAt: { lt: now } } });
    const grants = await db.mcpOAuthGrant.deleteMany({
      where: { OR: [{ revokedAt: { lt: dayAgo } }, { createdAt: { lt: dayAgo }, tokens: { none: {} } }] },
    });
    const clients = await db.mcpOAuthClient.deleteMany({
      where: {
        kind: "DYNAMIC",
        OR: [{ lastUsedAt: { lt: idleBefore } }, { lastUsedAt: null, createdAt: { lt: idleBefore } }],
        grants: { none: liveGrant(now) },
      },
    });
    return { clients: clients.count, grants: grants.count, tokens: tokens.count };
  },
};

/** The app's OAuth server: issuer and MCP resource from `PUBLIC_URL`. */
export const mcpOAuth = createMcpOAuth({ store: prismaOAuthStore, urls: oauthUrls(config.PUBLIC_URL) });
