import assert from "node:assert/strict";
import { it } from "node:test";
import { getAssistantTool, needsConfirmation, toolsFor } from "@ai/core/tools";
import "./xtra";

it("shares registered Xtra tools between assistant and MCP with mandatory write confirmation", () => {
  for (const name of ["shopping.xtra_add", "shopping.xtra_remove"]) {
    const tool = getAssistantTool(name)!;
    assert.equal(needsConfirmation(tool, true), true);
    assert.equal(tool.permission, "sensitive");
    assert.equal(toolsFor("child").some((candidate) => candidate.name === name), false);
  }
  for (const name of ["shopping.xtra_search", "shopping.xtra_list"]) {
    const tool = getAssistantTool(name)!;
    assert.equal(tool.permission, "read"); assert.equal(tool.confirm, "never");
  }
});
