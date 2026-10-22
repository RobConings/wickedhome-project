import { useLoaderData } from "react-router";
import { AssistantIntegrationCard, assistantClient, mcpOAuthAction } from "@/features/assistant";
import { useCurrentUser } from "@/features/auth";
import { HomeAssistantIntegrationCard, canManageHomeAssistant } from "@/features/home-assistant";
import {
  DriveStorageCard,
  GoogleIntegrationCard,
  IntegrationsScreen,
  canManageIntegrations,
  fetchDriveStorageStatus,
  fetchGoogleStatus,
} from "@/features/integrations";

/** Deferred card data: each card shows a skeleton until it arrives; a failure only affects that card. */
const deferred = <T,>(name: string, promise: Promise<T>): Promise<T | null> =>
  promise.catch((error: unknown) => {
    console.warn(`Integrations: ${name} could not load`, error);
    return null;
  });

export function loader() {
  return {
    google: deferred("google", fetchGoogleStatus()),
    // Owners/adults only (children get a 403, i.e. `null`, and don't see the card).
    driveStorage: fetchDriveStorageStatus().catch(() => null),
    // ── More integrations: add one deferred entry per card here (Home Assistant, Assistant…). ──
    assistant: deferred("assistant", assistantClient.status()),
  };
}

/** The Assistant card's forms post here: manual OAuth apps and the allowed redirect hosts (by `intent`). */
export const action = mcpOAuthAction;

/**
 * `/integrations`: one card per integration, each exported by its own feature. The page itself knows
 * nothing about them; add a card by adding its loader entry above and its element below.
 */
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return (
    <IntegrationsScreen>
      <GoogleIntegrationCard data={data.google} allFeatures={canManageIntegrations(user.role)} />
      {/* Bill documents in Google Drive instead of on the server (household setting, owners and adults). */}
      {canManageIntegrations(user.role) && <DriveStorageCard data={data.driveStorage} />}
      {/* ── More integration cards: add them below this line, one element each (Home Assistant, Assistant…). ── */}
      {/* Home Assistant loads its own status (skeleton meanwhile) and stays live over the event stream. */}
      <HomeAssistantIntegrationCard canManage={canManageHomeAssistant(user.role)} />
      {/* The assistant (LM Studio on the LAN): status, connection test, MCP tokens; setup steps until configured. */}
      <AssistantIntegrationCard data={data.assistant} />
    </IntegrationsScreen>
  );
}
