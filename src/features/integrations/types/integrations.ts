import { canManageHousehold } from "@/types/roles";
/**
 * Contracts shared by every card on the Integrations page (`/integrations`). Each integration owns its own
 * contract file; this one only holds what the page frame needs to show a status the same way everywhere.
 */

/**
 * - `not_configured`: the server lacks keys (`.env`); the card shows the setup steps.
 * - `disconnected`: configured, but this person / household hasn't connected it.
 * - `connected`: working.
 * - `error`: connected but the last attempt failed (expired consent, unreachable…); the card says what to do.
 */
export const INTEGRATION_STATUSES = ["not_configured", "disconnected", "connected", "error"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/** One line of a "not configured" card: a `.env` variable to set, or a command to run on the server. */
export type IntegrationSetupStep =
  | { kind: "env"; name: string; hint?: string }
  | { kind: "command"; command: string; hint?: string }
  | { kind: "text"; text: string };

/** Owners and adults connect household-wide integrations; personal ones (Google) everyone connects for themselves. */
export const canManageIntegrations = canManageHousehold;
