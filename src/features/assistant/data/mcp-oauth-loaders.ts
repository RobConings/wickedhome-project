import i18n from "i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { sessionLoader, type SessionUser } from "@/features/auth";
import { ApiRequestError } from "@/lib/api-client";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import { mcpOAuthAppInputSchema, mcpOAuthSettingsInputSchema, type CreatedMcpOAuthApp, type McpOAuthConsent, type McpOAuthSettings } from "../types/mcp-oauth";
import { mcpOAuthClient } from "./mcp-oauth-client";

/** Intents of the card's forms (posted to the page's route action, `mcpOAuthAction`). */
export const MCP_OAUTH_APP_INTENT = "mcp-oauth-app";
export const MCP_OAUTH_HOSTS_INTENT = "mcp-oauth-hosts";

export type McpOAuthActionResult = FormResult & { app?: CreatedMcpOAuthApp; settings?: McpOAuthSettings };

/**
 * The route action of the page that shows the Assistant card (`/integrations`): a manual OAuth app, or the
 * allowed redirect hosts. Answers with what was made, so the card shows the secret once.
 */
export async function mcpOAuthAction({ request }: ActionFunctionArgs): Promise<McpOAuthActionResult> {
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === MCP_OAUTH_APP_INTENT) {
      const { data, errors } = parseForm(mcpOAuthAppInputSchema, formData);
      if (errors) return { errors };
      return { ok: true, app: await mcpOAuthClient.createApp(data) };
    }
    if (intent === MCP_OAUTH_HOSTS_INTENT) {
      const { data, errors } = parseForm(mcpOAuthSettingsInputSchema, formData);
      if (errors) return { errors };
      return { ok: true, settings: await mcpOAuthClient.updateSettings({ allowedHosts: data.allowedHosts ?? [] }) };
    }
  } catch (error) {
    return toFormResult(error);
  }
  return { formError: i18n.t("common:errors.generic") };
}

export type McpConsentLoaderData = {
  user: SessionUser;
  requestId: string;
  /** `null` when the request is unknown or expired (or someone else's). */
  consent: McpOAuthConsent | null;
};

/**
 * `/connect/:requestId`, the OAuth consent page: signs in first when needed (the normal login, which comes
 * back here), then loads the request.
 */
export async function mcpConsentLoader(args: LoaderFunctionArgs): Promise<McpConsentLoaderData> {
  const { user } = await sessionLoader(args);
  const requestId = args.params.requestId ?? "";
  try {
    return { user, requestId, consent: await mcpOAuthClient.consent(requestId) };
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400)) return { user, requestId, consent: null };
    throw error;
  }
}
