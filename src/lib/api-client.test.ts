import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryString, resourcePath, withQuery } from "./api-client";

describe("queryString", () => {
  it("keeps set values in order and leaves out empty ones", () => {
    assert.equal(queryString({ q: "tap", type: undefined, projectId: "p1", empty: "", none: null, off: false }), "?q=tap&projectId=p1");
  });
  it("is empty without values", () => {
    assert.equal(queryString({}), "");
    assert.equal(queryString(), "");
    assert.equal(withQuery("/tasks", { placeId: undefined }), "/tasks");
  });
  it("stringifies numbers", () => {
    assert.equal(withQuery("/notifications", { limit: 20 }), "/notifications?limit=20");
  });
});

describe("resourcePath", () => {
  it("encodes every segment after the base", () => {
    const path = resourcePath("/tasks");
    assert.equal(path("a b"), "/tasks/a%20b");
    assert.equal(path("t1", "comments", "c/1"), "/tasks/t1/comments/c%2F1");
  });
});
