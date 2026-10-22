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
