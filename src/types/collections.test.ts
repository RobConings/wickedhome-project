import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { byName, sumCents } from "./collections";

describe("collections", () => {
  it("sorts by name", () => {
    assert.deepEqual([{ name: "b" }, { name: "a" }].sort(byName), [{ name: "a" }, { name: "b" }]);
  });
  it("sums cents", () => {
    assert.equal(sumCents([{ amountCents: 150 }, { amountCents: -50 }]), 100);
    assert.equal(sumCents([]), 0);
  });
});
