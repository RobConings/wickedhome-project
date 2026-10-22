import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAssistantToolByWireName, toolInputJsonSchema, toolsFor, type AssistantToolContext } from "@ai/core/tools";
import "./tools";

describe("floor geometry tool contracts", () => {
  it("exposes exact reads and writes through the same registry used by MCP", () => {
    const read = getAssistantToolByWireName("floorplan_geometry")!;
    const edit = getAssistantToolByWireName("floorplan_edit_geometry")!;
    assert.equal(read.permission, "read");
    assert.equal(read.confirm, "never");
    assert.equal(edit.permission, "sensitive");
    assert.equal(edit.confirm, "always");
    assert.ok(toolsFor("adult").includes(edit));
    assert.ok(!toolsFor("adult", { readOnly: true }).includes(edit));
    const schema = toolInputJsonSchema(edit) as { properties: Record<string, unknown> };
    assert.ok(schema.properties.allowOverlaps);
    assert.ok(schema.properties.rooms);
    assert.ok(schema.properties.elements);
    // Numeric object points avoid the tuple/string ambiguity of older connector schemas.
    const text = JSON.stringify(schema);
    assert.match(text, /"x":\{"type":"integer"/);
    assert.ok(!text.includes("prefixItems"));
  });

  it("offers the intentional overlap choice on simple drawing and repair tools too", () => {
    for (const name of ["draw_room", "move_room", "resize_room", "add_opening", "change_opening"]) {
      const tool = getAssistantToolByWireName(`floorplan_${name}`)!;
      const schema = toolInputJsonSchema(tool) as { properties: Record<string, unknown> };
      assert.ok(schema.properties.allowOverlaps, name);
    }
  });

  it("can describe deletions for the audit after saving without trying to delete them twice", async () => {
    const tool = getAssistantToolByWireName("floorplan_edit_geometry")!;
    const ctx = { locale: "en" } as AssistantToolContext;
    const input = { floor: { type: "floor", id: "f1", name: "First floor" }, rooms: [], elements: [], removeElementIds: ["deleted-wall"], replaceDrawing: false, allowOverlaps: true };
    assert.match(await tool.describe!(ctx, input), /1 explicit removals; keep reported overlaps/);
  });
});
