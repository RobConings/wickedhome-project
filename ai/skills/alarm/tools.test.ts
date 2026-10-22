/**
 * The alarm skill: status and arming (sensitive, always confirmed), and nothing that disarms or unlocks,
 * anywhere in the registry. No database and no Home Assistant needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/alarm/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { listAssistantTools, registerAssistantTool, toolInputJsonSchema } from "@ai/core/tools";
import "@ai/skills";

const forbidden = /disarm|unlock/i;

describe("alarm skill", () => {
  it("registers alarm status and arming (sensitive, always confirmed), and nothing that disarms or unlocks", () => {
    const tools = listAssistantTools();
    const alarm = tools.filter((tool) => tool.name.startsWith("alarm."));
    assert.deepEqual(
      alarm.map((tool) => [tool.name, tool.permission, tool.confirm, [...tool.roles].sort().join(","), tool.skill]),
      [
        ["alarm.arm_away", "sensitive", "always", "adult,owner", "alarm"],
        ["alarm.arm_home", "sensitive", "always", "adult,owner", "alarm"],
        ["alarm.status", "read", "never", "adult,child,owner", "alarm"],
      ],
    );
    for (const tool of tools) {
      assert.doesNotMatch(tool.name, forbidden, `${tool.name} must not exist`);
      assert.doesNotMatch(JSON.stringify(toolInputJsonSchema(tool)), forbidden, `${tool.name} must not take disarm/unlock values`);
    }
  });

  it("refuses to register a disarm tool", () => {
    const base = { description: "x", permission: "sensitive" as const, confirm: "always" as const, activity: { en: "x", nl: "x" }, run: () => null };
    assert.throws(() => registerAssistantTool({ ...base, name: "alarm.disarm", input: z.object({}) }));
    assert.throws(() => registerAssistantTool({ ...base, name: "alarm.set_mode", input: z.object({ mode: z.enum(["armed_away", "disarmed"]) }) }));
  });
});
