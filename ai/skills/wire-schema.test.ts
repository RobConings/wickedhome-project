/**
 * The tool definitions as the local model server gets them, for every real tool. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/wire-schema.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "@ai/skills/index";
import { questionSkillIds } from "@ai/core/routing";
import { skillsForRole } from "@ai/core/skills";
import { listAssistantTools, toOpenAiTools } from "@ai/core/tools";

/** Paths in a schema where a sub-schema is not an object (LM Studio refuses the whole request then). */
function badSubschemas(value: unknown, path: string, found: string[]): string[] {
  if (Array.isArray(value)) value.forEach((item, index) => badSubschemas(item, `${path}/${index}`, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "prefixItems") found.push(`${path}/prefixItems`);
      if (key === "items" && (typeof child !== "object" || child === null || Array.isArray(child))) found.push(`${path}/items`);
      badSubschemas(child, `${path}/${key}`, found);
    }
  }
  return found;
}

describe("tool definitions for the model", () => {
  it("have no tuples and no boolean `items` (floorplan_draw_room points, 2026-10-09)", () => {
    const bad = toOpenAiTools(listAssistantTools()).flatMap((tool) => badSubschemas(tool.function.parameters, tool.function.name, []));
    assert.deepEqual(bad, []);
  });

  it("write a corner point [x, y] as an array of numbers", () => {
    const draw = toOpenAiTools(listAssistantTools().filter((tool) => tool.name === "floorplan.draw_room"))[0];
    const points = (draw?.function.parameters as { properties: Record<string, unknown> }).properties.points;
    assert.deepEqual((points as { items: unknown }).items, { type: "array", items: { type: "number" } });
  });

  it("a Dutch 'door' (by) doesn't load the floor plans", () => {
    const ids = questionSkillIds("zet een PS erbij dat het gegenereerd is door mijn AI Assistant", skillsForRole("owner"));
    assert.ok(!ids.includes("floorplan"), ids.join(", "));
  });
});
