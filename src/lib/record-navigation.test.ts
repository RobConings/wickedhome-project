import assert from "node:assert/strict";
import { it } from "node:test";
import { internalOrigin, withRecordOrigin } from "./record-navigation";

it("record return context restores filters and section without accepting external destinations", () => {
  const origin = "/projects?view=cards&status=active#materials";
  const destination = withRecordOrigin("/tasks/one", origin);
  assert.equal(new URL(destination, "https://wickedhome.invalid").searchParams.get("from"), origin);
  assert.equal(internalOrigin(origin), origin);
  for (const invalid of ["https://evil.test/", "//evil.test/", "/\\evil.test/", "/one\nlocation", "javascript:alert(1)", "task-id"]) assert.equal(internalOrigin(invalid), null);
  assert.equal(withRecordOrigin("/projects#costs", origin), "/projects#costs");
  assert.equal(withRecordOrigin("/tasks/one?from=project-id", origin), "/tasks/one?from=project-id");
  assert.equal(withRecordOrigin("https://other.test/", origin), "https://other.test/");
});
