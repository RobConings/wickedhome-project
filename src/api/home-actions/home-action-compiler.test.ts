import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalSteps, compileDispatcher, compileRule, outcomeExpression, outcomeSatisfied, type PublishedAction } from "./home-action-compiler";
import { homeActionInputSchema, homeActionRunSchema, homeRuleInputSchema, type HomeActionStep } from "@/features/home-actions/types/home-actions";
import { controlCall, describeControl, validateControlRequest } from "../home-assistant/ha-control";

const device = (entityId: string, action: "temperature" | "off" = "temperature", value = 18): Extract<HomeActionStep, { kind: "device" }> => ({ kind: "device", deviceId: "device1", entityId, action, ...(action === "temperature" ? { value } : {}), onFailure: "stop" });
const definition = homeActionInputSchema.parse({ name: "Away", steps: [device("climate.hc2")], contactDeviceIds: [], alarmMode: null });
const action: PublishedAction = { id: "action1", revision: 1, definition, contacts: ["binary_sensor.window"], alarmEntityId: null };
const state = { entity_id: "climate.hc2", state: "auto", attributes: { temperature: 19, min_temp: 5, max_temp: 30, supported_features: 17 } };

describe("Household action compiler", () => {
  it("coalesces shared circuit commands and rejects conflicting room markers", () => {
    assert.equal(canonicalSteps([device("climate.hc2"), { ...device("climate.hc2"), deviceId: "another-radiator" }]).length, 1);
    assert.throws(() => canonicalSteps([device("climate.hc2"), device("climate.hc2", "temperature", 20)]), /Conflicting/);
    assert.equal(canonicalSteps([device("climate.hc1"), device("climate.hc2")]).length, 2);
    assert.throws(() => canonicalSteps([device("switch.light", "off"), { ...device("switch.light", "off"), action: "on" }]));
  });
  it("requires observable state rather than treating a service response as confirmation", () => {
    assert.equal(outcomeSatisfied(device("climate.hc2"), state), false);
    assert.equal(outcomeSatisfied(device("climate.hc2"), { ...state, attributes: { temperature: 18 } }), true);
    assert.equal(outcomeSatisfied(device("climate.hc2"), { ...state, state: "unavailable", attributes: { temperature: 18 } }), false);
    assert.equal(outcomeExpression({ ...device("media_player.tv", "off"), action: "next" }), null);
  });
  it("uses one non-queued executor and waits for each relevant outcome", () => {
    const compiled = compileDispatcher([action], new Map([[state.entity_id, state]]));
    assert.equal(compiled.mode, "single");
    const text = JSON.stringify(compiled);
    assert.match(text, /wait_template/); assert.match(text, /continue_on_timeout/);
    for (const result of ["requested", "confirmed", "failed", "skipped", "completed", "blocked"]) assert.match(text, new RegExp(result));
    assert.match(text, /binary_sensor.window/);
    assert.equal(text.includes("alarm_disarm"), false);
  });
  it("reserves the executor before a manual alarm gate and never stores a PIN", () => {
    const compiled = compileDispatcher([{ ...action, definition: { ...definition, alarmMode: "away" }, alarmEntityId: "alarm_control_panel.alarm" }], new Map([[state.entity_id, state]]));
    const text = JSON.stringify(compiled);
    assert.match(text, /manual_gate/); assert.match(text, /wickedhome_alarm_gate/); assert.match(text, /armed_away/);
    assert.equal(text.includes("alarm_arm"), false); assert.equal(text.includes('"code"'), false);
    assert.equal(homeActionInputSchema.safeParse({ ...definition, code: "1234" }).success, false);
    assert.equal(homeActionInputSchema.safeParse({ ...definition, steps: [{ kind: "service", service: "alarm_control_panel.alarm_disarm" }] }).success, false);
    assert.equal(homeActionRunSchema.safeParse({ confirm: false, requestKey: crypto.randomUUID(), revision: 1 }).success, false);
  });
  it("produces stable publication content regardless of database row order", () => {
    const b = { ...action, id: "another", revision: 2 };
    assert.deepEqual(compileDispatcher([action, b], new Map([[state.entity_id, state]])), compileDispatcher([b, action], new Map([[state.entity_id, state]])));
  });
  it("compiles native triggers and rejects recovery states", () => {
    const rule = homeRuleInputSchema.parse({ name: "Window", actionId: action.id, trigger: { kind: "state", deviceId: "contact", entityId: "binary_sensor.window", to: "on", forSeconds: 900 } });
    const native = compileRule("rule1", rule, action);
    assert.equal(native.initial_state, false); assert.equal(native.mode, "single");
    assert.match(JSON.stringify(native), /from_state/); assert.match(JSON.stringify(native), /unavailable/); assert.match(JSON.stringify(native), /900/);
  });
});

describe("Media and heating capabilities", () => {
  it("uses declared flags and source choices, with bounded numeric controls", () => {
    const media = { entity_id: "media_player.tv", state: "off", attributes: { supported_features: 128 | 256 | 4 | 2048 | 8, volume_level: .3, source_list: ["HDMI 1", "TV"], source: "TV" } };
    const control = describeControl(media);
    assert.deepEqual(control?.actions, ["on", "off", "mute"]);
    assert.equal(control?.adjustment?.value, 30);
    validateControlRequest(control, { action: "source", option: "HDMI 1" });
    assert.throws(() => validateControlRequest(control, { action: "source", option: "http://other" }));
    assert.throws(() => validateControlRequest(control, { action: "volume", value: 101 }));
    assert.deepEqual(controlCall(media, { action: "volume", value: 35 }), { domain: "media_player", service: "volume_set", data: { volume_level: .35 } });
    assert.equal(describeControl({ ...media, state: "unavailable" })?.actions.length, 0);
  });
  it("offers only actual thermostat/water-heater modes", () => {
    const control = describeControl({ ...state, attributes: { ...state.attributes, hvac_modes: ["auto", "heat"], preset_modes: ["eco", "comfort"] } }, "°C");
    validateControlRequest(control, { action: "mode", option: "auto" });
    assert.throws(() => validateControlRequest(control, { action: "mode", option: "cool" }));
    const water = { entity_id: "water_heater.buderus", state: "performance", attributes: { supported_features: 3, temperature: 55, min_temp: 30, max_temp: 60, operation_list: ["eco", "performance"], operation_mode: "performance" } };
    const waterControl = describeControl(water, "°C");
    validateControlRequest(waterControl, { action: "temperature", value: 55 });
    assert.throws(() => validateControlRequest(waterControl, { action: "temperature", value: 80 }));
    assert.equal(describeControl(water, "°F")?.adjustment, null);
  });
});
