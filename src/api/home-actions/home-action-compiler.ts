import type { HomeActionInput, HomeActionStep, HomeRuleInput } from "@/features/home-actions/types/home-actions";
import { controlCall } from "../home-assistant/ha-control";
import type { HaState } from "../home-assistant/ha-client";

export const ACTION_EVENT = "wickedhome_action_progress";
export const DISPATCHER = "wickedhome_actions";
export const DISPATCHER_ENTITY = `script.${DISPATCHER}`;
export type PublishedAction = { id: string; revision: number; definition: HomeActionInput; contacts: string[]; alarmEntityId: string | null };
const literal = (value: unknown) => JSON.stringify(value);

/** Only outcomes that can be observed are allowed in routines. Transport success isn't confirmation. */
export function outcomeExpression(step: Extract<HomeActionStep, { kind: "device" }>): string | null {
  const entity = literal(step.entityId), value = literal(step.value), option = literal(step.option);
  const attr = (name: string) => `state_attr(${entity}, '${name}')`;
  switch (step.action) {
    case "temperature": return `${attr("temperature")} is number and (${attr("temperature")} - ${value}) | abs < 0.01`;
    case "brightness": return `${attr("brightness")} is number and (${attr("brightness")} / 255 * 100 - ${value}) | abs < 1`;
    case "position": return `${attr("current_position")} is number and (${attr("current_position")} - ${value}) | abs < 1`;
    case "volume": return `${attr("volume_level")} is number and (${attr("volume_level")} * 100 - ${value}) | abs < 1`;
    case "mode": return `is_state(${entity}, ${option})`;
    case "preset": return `${attr("preset_mode")} == ${option}`;
    case "operation": return `${attr("operation_mode")} == ${option}`;
    case "source": return `${attr("source")} == ${option}`;
    case "mute": return `${attr("is_volume_muted")} == true`;
    case "unmute": return `${attr("is_volume_muted")} == false`;
    case "off": return `is_state(${entity}, 'off')`;
    case "on": return step.entityId.startsWith("media_player.") || step.entityId.startsWith("climate.") ? `states(${entity}) not in ['off', 'unknown', 'unavailable']` : `is_state(${entity}, 'on')`;
    case "open": return `is_state(${entity}, 'open')`;
    case "close": return `is_state(${entity}, 'closed')`;
    case "play": return `is_state(${entity}, 'playing')`;
    case "pause": return `is_state(${entity}, 'paused')`;
    case "stop": return `states(${entity}) in ['idle', 'off']`;
    default: return null;
  }
}

export function outcomeSatisfied(step: Extract<HomeActionStep, { kind: "device" }>, state: HaState | null): boolean {
  if (!state || ["unknown", "unavailable"].includes(state.state)) return false;
  const numeric = (name: string, target: number, tolerance = 0.01) => typeof state.attributes[name] === "number" && Math.abs(Number(state.attributes[name]) - target) < tolerance;
  switch (step.action) {
    case "temperature": return numeric("temperature", step.value!);
    case "brightness": return numeric("brightness", step.value! * 255 / 100, 2.55);
    case "position": return numeric("current_position", step.value!, 1);
    case "volume": return numeric("volume_level", step.value! / 100, .01);
    case "mode": return state.state === step.option;
    case "preset": return state.attributes.preset_mode === step.option;
    case "operation": return state.attributes.operation_mode === step.option;
    case "source": return state.attributes.source === step.option;
    case "mute": return state.attributes.is_volume_muted === true;
    case "unmute": return state.attributes.is_volume_muted === false;
    case "on": return step.entityId.startsWith("media_player.") || step.entityId.startsWith("climate.") ? state.state !== "off" : state.state === "on";
    case "off": return state.state === "off";
    case "open": return state.state === "open";
    case "close": return state.state === "closed";
    case "play": return state.state === "playing";
    case "pause": return state.state === "paused";
    case "stop": return ["idle", "off"].includes(state.state);
    default: return false;
  }
}

/** Reject two different settings for one shared circuit even when different room markers were selected. */
export function canonicalSteps(steps: HomeActionStep[]): HomeActionStep[] {
  const targets = new Map<string, string>();
  return steps.filter((step) => {
    if (step.kind === "wait") return true;
    const key = `${step.entityId}:${["mode", "preset", "temperature", "on", "off"].includes(step.action) && step.entityId.startsWith("climate.") ? "heating" : step.action === "on" || step.action === "off" ? "power" : step.action}`;
    const command = literal({ action: step.action, value: step.value, option: step.option });
    const existing = targets.get(key);
    if (existing && existing !== command) throw new Error(`Conflicting settings for shared target ${step.entityId}`);
    targets.set(key, command);
    return !existing;
  });
}

export function compileDispatcher(actions: PublishedAction[], states: Map<string, HaState>) {
  const branches = [...actions].sort((a, b) => a.id.localeCompare(b.id)).map((action) => {
    const event = (phase: string, index = -1) => ({ event: ACTION_EVENT, event_data: { action_id: action.id, revision: action.revision, run_id: "{{ wh_run_id }}", phase, index } });
    const stop = (message: string) => ({ stop: message });
    const sequences: unknown[] = [event("started")];
    const closed = action.contacts.map((id) => `is_state(${literal(id)}, 'off')`).join(" and ") || "true";
    sequences.push({ if: [{ condition: "template", value_template: `{{ not (${closed}) }}` }], then: [event("blocked"), stop("Selected contacts are open or unavailable")] });
    if (action.definition.alarmMode) sequences.push(
      { if: [{ condition: "template", value_template: "{{ not (manual_gate | default(false)) }}" }], then: [event("blocked"), stop("Manual alarm confirmation required")] },
      { wait_for_trigger: [{ trigger: "event", event_type: "wickedhome_alarm_gate", event_data: { run_id: "{{ wh_run_id }}" } }], timeout: { seconds: 120 }, continue_on_timeout: true },
      { if: [{ condition: "template", value_template: `{{ not (wait.completed and is_state(${literal(action.alarmEntityId)}, ${literal(`armed_${action.definition.alarmMode}`)})) }}` }], then: [event("blocked"), stop("Alarm confirmation was not observed")] },
    );
    action.definition.steps.forEach((step, index) => {
      if (step.kind === "wait") { sequences.push(event("requested", index), { delay: { seconds: step.seconds } }, event("confirmed", index)); return; }
      const state = states.get(step.entityId);
      if (!state) throw new Error(`Unknown entity ${step.entityId}`);
      const call = controlCall(state, step);
      const outcome = outcomeExpression(step);
      if (typeof call === "string" || !outcome) throw new Error(`Unsupported routine command for ${step.entityId}`);
      const fail = [event("failed", index), ...(step.onFailure === "stop" ? [stop("Device did not confirm the requested state")] : [])];
      const execute = [event("requested", index), { action: `${call.domain}.${call.service}`, target: { entity_id: step.entityId }, data: call.data, continue_on_error: true },
        { wait_template: `{{ ${outcome} }}`, timeout: { seconds: 60 }, continue_on_timeout: true },
        { if: [{ condition: "template", value_template: "{{ wait.completed }}" }], then: [event("confirmed", index)], else: fail }];
      sequences.push({ if: [{ condition: "template", value_template: `{{ ${outcome} }}` }], then: [event("skipped", index)], else: [{ if: [{ condition: "template", value_template: `{{ states(${literal(step.entityId)}) not in ['unknown', 'unavailable'] }}` }], then: execute, else: fail }] });
    });
    sequences.push(event("completed"));
    return { conditions: `{{ wh_action_id | default('') == ${literal(action.id)} and wh_revision | default(${action.revision}) | int == ${action.revision} }}`, sequence: sequences };
  });
  return { alias: "WickedHome actions", description: "Managed by WickedHome. Publish changes from WickedHome.", mode: "single", max_exceeded: "silent", sequence: [
    { variables: { wh_run_id: "{{ run_id | default('native-' ~ now().strftime('%Y%m%d%H%M%S%f') ~ '-' ~ (range(0, 99999) | random | string), true) }}" } },
    ...(branches.length ? [{ choose: branches }] : [{ stop: "No published actions" }]),
  ] };
}

export function compileRule(id: string, rule: HomeRuleInput, action: { id: string; revision: number }) {
  const trigger = rule.trigger.kind === "time" ? { trigger: "time", at: `${rule.trigger.at}:00` }
    : rule.trigger.kind === "sunset" ? { trigger: "sun", event: "sunset", offset: { minutes: rule.trigger.offsetMinutes } }
    : { trigger: "state", entity_id: rule.trigger.entityId, to: rule.trigger.to, ...(rule.trigger.forSeconds ? { for: { seconds: rule.trigger.forSeconds } } : {}) };
  return { id: `wickedhome_${id}`, alias: `WickedHome · ${rule.name}`, description: "Managed by WickedHome", mode: "single", initial_state: rule.enabled, triggers: [trigger],
    conditions: [{ condition: "time", weekday: rule.weekdays }, { condition: "template", value_template: `{{ this.attributes.get('last_triggered') is none or as_timestamp(now()) - as_timestamp(this.attributes.get('last_triggered')) >= ${rule.cooldownSeconds} }}` }, ...(rule.trigger.kind === "state" ? [{ condition: "template", value_template: "{{ trigger.from_state is not none and trigger.from_state.state not in ['unknown', 'unavailable'] }}" }] : [])],
    actions: [{ action: "script.turn_on", target: { entity_id: DISPATCHER_ENTITY }, data: { variables: { wh_action_id: action.id } } }] };
}
