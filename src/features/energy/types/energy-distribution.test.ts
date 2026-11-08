import assert from "node:assert/strict";
import { it } from "node:test";
import { energyDistribution, energyHierarchyError } from "./energy-distribution";

it("branches included sub-meters once and keeps Other at every measured branch", () => {
  const flow = energyDistribution(1000, [
    { id: "kitchen", name: "Kitchen meter", parentId: null, energyWh: 500 },
    { id: "fridge", name: "Fridge", parentId: "kitchen", energyWh: 200 },
    { id: "freezer", name: "Freezer", parentId: "kitchen", energyWh: 100 },
    { id: "heating", name: "Heating", parentId: null, energyWh: 300 },
  ]);
  assert.equal(flow.accountedWh, 800);
  assert.equal(flow.otherWh, 200);
  assert.equal(flow.branches[0]!.otherWh, 200);
  assert.equal(flow.branches[0]!.children[0]!.otherWh, 200);
});
it("missing readings remain unknown while a known child contributes once to the measured subtotal", () => {
  const flow = energyDistribution(1000, [
    { id: "room", name: "Room", parentId: null, energyWh: null },
    { id: "device", name: "Device", parentId: "room", energyWh: 200 },
  ]);
  assert.equal(flow.branches[0]!.energyWh, null);
  assert.equal(flow.branches[0]!.otherWh, null);
  assert.equal(flow.accountedWh, 200);
  assert.equal(flow.otherWh, 800);
  assert.equal(energyDistribution(null, []).otherWh, null);
  assert.equal(energyDistribution(0, []).otherWh, 0);
});
it("inconsistent readings show excess rather than a fabricated zero residual", () => {
  const flow = energyDistribution(100, [
    { id: "parent", name: "Parent", parentId: null, energyWh: 150 },
    { id: "child", name: "Child", parentId: "parent", energyWh: 200 },
  ]);
  assert.equal(flow.excessWh, 50);
  assert.equal(flow.otherWh, null);
  assert.equal(flow.branches[0]!.excessWh, 50);
  assert.equal(flow.branches[0]!.otherWh, null);
});
it("rejects cyclic or unknown branches instead of double counting or silently promoting them", () => {
  assert.equal(energyHierarchyError([{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }]), "meterCycle");
  assert.equal(energyHierarchyError([{ id: "a", parentId: "missing" }]), "unknownParent");
  assert.equal(energyDistribution(10, [{ id: "a", name: "A", parentId: "a", energyWh: 10 }]).accountedWh, null);
});
