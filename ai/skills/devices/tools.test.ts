/**
 * Devices, Home Assistant and the drawing tools: what may change things and how it is confirmed, and that no
 * tool anywhere opens doors, gates or the garage, unlocks or disarms. No database and no Home Assistant needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/devices/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAssistantTools, toolInputJsonSchema } from "@ai/core/tools";
import "@ai/skills";

/** Words no tool name or argument value may contain: physical security is never the assistant's. */
const SECURITY = /disarm|unlock|garage|gate|poort|deur_open|open_door|lock_|_lock|alarm_off/i;

const tool = (name: string) => {
  const found = listAssistantTools().find((candidate) => candidate.name === name);
  assert.ok(found, `${name} is registered`);
  return found;
};

describe("devices and Home Assistant", () => {
  it("has no tool that opens doors, gates or the garage, unlocks or disarms", () => {
    for (const entry of listAssistantTools()) {
      assert.doesNotMatch(entry.name, SECURITY, `${entry.name} must not exist`);
      const schema = JSON.stringify(toolInputJsonSchema(entry));
      for (const values of schema.matchAll(/"enum":\[([^\]]*)\]/g)) assert.doesNotMatch(values[1] ?? "", SECURITY, `${entry.name} must not take such values`);
    }
  });

  it("switches single devices with a first-time confirmation; heating, scenes and changes always ask", () => {
    const rules = (name: string) => [tool(name).permission, tool(name).confirm, [...tool(name).roles].sort().join(",")];
    assert.deepEqual(rules("devices.switch"), ["write", "first-time", "adult,owner"]);
    assert.deepEqual(rules("devices.set_value"), ["write", "first-time", "adult,owner"]);
    assert.deepEqual(rules("devices.climate"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("devices.scene"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("devices.delete"), ["sensitive", "always", "adult,owner"]);
    assert.deepEqual(rules("devices.list"), ["read", "never", "adult,child,owner"]);
    // Only these actions: nothing like "unlock" or a door.
    const actions = (toolInputJsonSchema(tool("devices.switch")).properties as Record<string, { enum?: string[] }>).action?.enum;
    assert.deepEqual(actions, ["on", "off", "open", "close", "brightness", "position"]);
  });

  it("keeps arming the alarm always confirmed", () => {
    assert.equal(tool("alarm.arm_away").confirm, "always");
    assert.equal(tool("alarm.arm_home").confirm, "always");
  });

  it("makes every drawing change ask every time, with a preview", () => {
    const drawing = listAssistantTools().filter((entry) => entry.skill === "floorplan" && entry.permission !== "read");
    assert.ok(drawing.length >= 6);
    for (const entry of drawing) {
      assert.equal(entry.confirm, "always", entry.name);
      assert.ok(entry.preview, `${entry.name} has a preview`);
      assert.deepEqual([...entry.roles].sort(), ["adult", "owner"], entry.name);
    }
    assert.equal(tool("places.delete_room").permission, "sensitive");
  });
});
