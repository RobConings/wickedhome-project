import { api } from "@/lib/api-client";
import type {
  CreatedMcpOAuthApp,
  McpOAuthAppInput,
  McpOAuthConsent,
  McpOAuthDecisionInput,
  McpOAuthDecisionResult,
  McpOAuthOverview,
  McpOAuthSettings,
  McpOAuthSettingsInput,
} from "../types/mcp-oauth";

/**
 * Everything the MCP OAuth UI asks the server (`/api/assistant/oauth`, ai/docs/MCP-OAUTH.md), behind one
 * interface so stories pass a fake: the card's connected apps, DCR settings and manual apps, and the consent page.
 */
export type McpOAuthClient = {
  overview: () => Promise<McpOAuthOverview>;
  disconnect: (grantId: string) => Promise<void>;
  updateSettings: (input: McpOAuthSettingsInput) => Promise<McpOAuthSettings>;
  createApp: (input: McpOAuthAppInput) => Promise<CreatedMcpOAuthApp>;
  deleteApp: (id: string) => Promise<void>;
  consent: (requestId: string) => Promise<McpOAuthConsent>;
  decide: (requestId: string, input: McpOAuthDecisionInput) => Promise<McpOAuthDecisionResult>;
};

const path = (id: string) => encodeURIComponent(id);

export const mcpOAuthClient: McpOAuthClient = {
  overview: () => api.get<McpOAuthOverview>("/assistant/oauth"),
  disconnect: (grantId) => api.delete(`/assistant/oauth/connected/${path(grantId)}`),
  updateSettings: (input) => api.patch<McpOAuthSettings>("/assistant/oauth/settings", input),
  createApp: (input) => api.post<CreatedMcpOAuthApp>("/assistant/oauth/apps", input),
  deleteApp: (id) => api.delete(`/assistant/oauth/apps/${path(id)}`),
  consent: (requestId) => api.get<McpOAuthConsent>(`/assistant/oauth/requests/${path(requestId)}`),
  decide: (requestId, input) => api.post<McpOAuthDecisionResult>(`/assistant/oauth/requests/${path(requestId)}`, input),
};
