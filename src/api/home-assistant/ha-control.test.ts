/**
 * What the assistant's device tools may switch in Home Assistant (ha-control.ts): lights, switches, fans,
 * blind-like covers, thermostats and scenes, and never anything that removes physical security.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/home-assistant/ha-control.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { controlCall, controlRefusal } from "./ha-control";

const entity = (entity_id: string, attributes: Record<string, unknown> = {}) => ({ entity_id, attributes });

describe("Home Assistant control", () => {
  it("switches lights, switches, fans, blinds, thermostats and scenes", () => {
    assert.deepEqual(controlCall(entity("light.keuken"), { action: "off" }), { domain: "light", service: "turn_off", data: {} });
    assert.deepEqual(controlCall(entity("light.keuken"), { action: "brightness", value: 40 }), { domain: "light", service: "turn_on", data: { brightness_pct: 40 } });
    assert.deepEqual(controlCall(entity("light.outdoor_lights"), { action: "on" }), { domain: "light", service: "turn_on", data: {} });
    assert.deepEqual(controlCall(entity("cover.living", { device_class: "shutter" }), { action: "position", value: 30 }), { domain: "cover", service: "set_cover_position", data: { position: 30 } });
    assert.deepEqual(controlCall(entity("climate.living"), { action: "temperature", value: 21.3 }), { domain: "climate", service: "set_temperature", data: { temperature: 21.5 } });
    assert.deepEqual(controlCall(entity("climate.living"), { action: "temperature", value: 45 }), { domain: "climate", service: "set_temperature", data: { temperature: 30 } });
    assert.deepEqual(controlCall(entity("scene.film"), { action: "on" }), { domain: "scene", service: "turn_on", data: {} });
  });

  it("never switches locks, alarms, garage doors, gates or doors", () => {
    for (const [id, attributes] of [
      ["lock.voordeur", {}],
      ["alarm_control_panel.verisure", {}],
      ["cover.garage", { device_class: "garage" }],
      ["cover.oprit", { device_class: "gate" }],
      ["cover.unknown_cover", {}],
      ["switch.garagepoort", {}],
      ["switch.relay_1", { friendly_name: "Poort oprit" }],
      ["switch.front_door_opener", {}],
      ["scene.alarm_off", {}],
      ["siren.hal", {}],
      ["button.open", {}],
      ["input_boolean.away", {}],
    ] as const) {
      assert.ok(controlRefusal(entity(id, attributes)), `${id} must be refused`);
      assert.equal(typeof controlCall(entity(id, attributes), { action: "open" }), "string", `${id} gives no call`);
    }
  });

  it("refuses actions that don't fit the device", () => {
    assert.equal(typeof controlCall(entity("switch.boiler"), { action: "temperature", value: 20 }), "string");
    assert.equal(typeof controlCall(entity("scene.film"), { action: "off" }), "string");
  });
});

it("offers only reported, available device capabilities and preserves unknown values", async () => {
  const { describeControl } = await import("./ha-control");
  const state = (entity_id: string, attributes: Record<string, unknown> = {}, value = "on") => ({ entity_id, attributes, state: value, last_changed: "2026-11-07T10:00:00Z", last_updated: "2026-11-07T10:00:00Z", context: { id: "test", parent_id: null, user_id: null } });
  assert.equal(describeControl(state("lock.front")), null);
  assert.equal(describeControl(state("cover.garage", { device_class: "garage" })), null);
  assert.equal(describeControl(state("light.kitchen"))?.adjustment, null);
  assert.equal(describeControl(state("light.kitchen", { supported_color_modes: ["brightness"] }))?.adjustment?.value, null);
  assert.deepEqual(describeControl(state("light.kitchen", {}, "unavailable"))?.actions, []);
  const blind = describeControl(state("cover.living", { device_class: "blind", supported_features: 5, current_position: 40 }));
  assert.deepEqual(blind?.actions, ["open"]); assert.equal(blind?.adjustment?.value, 40);
  assert.equal(describeControl(state("climate.living", { supported_features: 1, temperature_unit: "°F" }))?.adjustment, null);
  assert.equal(describeControl(state("climate.living", { supported_features: 0 }))?.adjustment, null);
  assert.equal(describeControl(state("climate.living", { supported_features: 1 }))?.adjustment, null);
  assert.deepEqual(describeControl(state("climate.living", { supported_features: 256 }))?.actions, ["on"]);
  assert.equal(describeControl(state("climate.living", { supported_features: 1, temperature_unit: "°C", min_temp: 10, max_temp: 25, temperature: 21 }))?.adjustment?.max, 25);
  const fine = describeControl(state("climate.living", { supported_features: 1, temperature_unit: "°C", min_temp: 7, max_temp: 25, target_temp_step: 0.1 }));
  assert.equal(fine?.adjustment?.step, 0.5, "Do not offer precision the command adapter would round away");
  const unusual = describeControl(state("climate.living", { supported_features: 1, temperature_unit: "°C", min_temp: 7.2, max_temp: 25, target_temp_step: 0.3 }));
  assert.equal(unusual?.adjustment?.min, 7.5); assert.equal(unusual?.adjustment?.step, 1.5);

});
