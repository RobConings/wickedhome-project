import type { Role } from "@/features/auth/types/auth";
import { ALARM_ACTION_POLICY, type AlarmActionKind } from "@/features/home-assistant/types/home-assistant";

/**
 * Who may arm or disarm. Pure and unit-tested (home-assistant.test.ts).
 *
 * - Only owners and adults, never children.
 * - Disarming only by a person signed in to the UI (`kind: "user"`): never the assistant, MCP or voice,
 *   whatever their user's role (ALARM_ACTION_POLICY.disarm.assistantAllowed === false).
 * - Arming by the assistant is allowed by the policy, but its tool must always ask for confirmation.
 */

export type AlarmActor =
  | { kind: "user"; userId: string; name: string; role: Role }
  | { kind: "assistant" | "mcp" | "voice"; userId: string | null; name: string; role: Role | null };

export type AlarmRefusal = "role" | "not_in_ui";

export class AlarmRefusedError extends Error {
  constructor(readonly reason: AlarmRefusal) {
    super(reason === "role" ? "Only owners and adults can use the alarm" : "Disarming is only possible in the app, with the code");
  }
}

const ALARM_ROLES: readonly Role[] = ["owner", "adult"];

export function alarmRefusal(action: AlarmActionKind, actor: AlarmActor): AlarmRefusal | null {
  if (actor.kind !== "user" && !ALARM_ACTION_POLICY[action].assistantAllowed) return "not_in_ui";
  if (!actor.role || !ALARM_ROLES.includes(actor.role)) return "role";
  return null;
}

export function assertAlarmActionAllowed(action: AlarmActionKind, actor: AlarmActor): void {
  const refusal = alarmRefusal(action, actor);
  if (refusal) throw new AlarmRefusedError(refusal);
}

/** Never let the code end up in a log line, even when Home Assistant echoes it in an error. */
export function scrubCode(text: string, code: string | undefined): string {
  if (!code) return text;
  return text.split(code).join("•••");
}
