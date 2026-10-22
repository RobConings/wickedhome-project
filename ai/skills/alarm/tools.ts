import { z } from "zod";
import { ALARM_ACTION_POLICY } from "@/features/home-assistant/types/home-assistant";
import type { AlarmActor } from "@/api/home-assistant/alarm-guard";
import { armAlarm, getAlarmOverview } from "@/api/home-assistant/ha-alarm";
import { done, registerAssistantSkill, registerAssistantTool, type AssistantToolContext } from "@ai/core/kit";

/**
 * Skill "alarm": the house alarm through Home Assistant. Exactly three tools, following ALARM_ACTION_POLICY:
 *
 * - `alarm.status` (read): the panel's state and the last changes.
 * - `alarm.arm_home` / `alarm.arm_away` (sensitive, always confirmed): the same arm path as the UI, audit-logged
 *   with the person as actor and "assistant:"/"mcp:" in front of the name. No code: a panel that needs the
 *   code to arm refuses, and the person arms it in the app instead. Codes never pass through the model.
 *
 * Disarming is never a tool (not here, not anywhere): the registry refuses such names, and the policy says so.
 */

registerAssistantSkill({
  id: "alarm",
  title: { en: "Alarm", nl: "Alarm" },
  summary: "The house alarm: status and arming (home or away). Disarming is never possible here.",
  keywords: {
    nl: ["alarm", "alarmsysteem", "inschakelen", "aanzetten", "verisure", "beveiliging"],
    en: ["alarm", "security system", "arm", "verisure"],
  },
});

const actorOf = (ctx: AssistantToolContext): AlarmActor => ({
  kind: ctx.channel === "mcp" ? "mcp" : "assistant",
  userId: ctx.user.id,
  name: ctx.user.name,
  role: ctx.user.role,
});

registerAssistantTool({
  name: "alarm.status",
  description: "The house alarm (Verisure via Home Assistant): whether it is armed (home or away), triggered or off, since when, and the last changes.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the alarm", nl: "Alarm bekeken" },
  run: async (ctx) => {
    const overview = await getAlarmOverview(ctx.householdId, { includeLog: false });
    if (!overview.panel) return { available: false, reason: overview.status.state === "not_configured" ? "Home Assistant is not set up" : "Home Assistant is not connected" };
    return {
      name: overview.panel.name,
      state: overview.panel.state,
      since: overview.panel.changedAt,
      lastChanges: overview.history.slice(0, 5),
    };
  },
});

for (const mode of ["home", "away"] as const) {
  const action = mode === "home" ? "arm_home" : "arm_away";
  const policy = ALARM_ACTION_POLICY[action];
  if (!policy.assistantAllowed) continue;
  registerAssistantTool({
    name: `alarm.${action}`,
    description:
      mode === "home"
        ? "Arm the house alarm in home mode (perimeter: doors and windows; people stay inside). Always confirmed by the person."
        : "Arm the house alarm in away mode (everything; everyone has left). Always confirmed by the person.",
    input: z.object({}),
    permission: policy.permission,
    confirm: policy.confirmation,
    roles: ["owner", "adult"],
    activity: mode === "home" ? { en: "Armed the alarm (home)", nl: "Alarm ingeschakeld (thuis)" } : { en: "Armed the alarm (away)", nl: "Alarm ingeschakeld (afwezig)" },
    describe: (ctx) =>
      ctx.locale === "nl"
        ? `Het alarm inschakelen (${mode === "home" ? "thuis" : "afwezig"})`
        : `Arm the alarm (${mode === "home" ? "home" : "away"})`,
    // armAlarm records every attempt (alarm log + audit log) with the assistant/MCP channel itself.
    auditedByService: true,
    run: async (ctx) => {
      const result = await armAlarm(ctx.householdId, actorOf(ctx), mode);
      return result.ok ? done(`The alarm is armed (${mode}).`, { state: result.state }) : { ok: false, state: result.state };
    },
  });
}
