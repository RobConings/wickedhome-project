/** A configured metered branch; parent readings include their children's readings. */
export type EnergyDistributionReading = {
  id: string;
  name: string;
  parentId: string | null;
  energyWh: number | null;
};
export type EnergyDistributionBranch = EnergyDistributionReading & {
  children: EnergyDistributionBranch[];
  /** Known non-overlapping consumption represented by this branch (measured subtotal if its own meter is absent). */
  accountedWh: number;
  /** Unknown when this branch has no reading or its child readings exceed it. */
  otherWh: number | null;
  excessWh: number;
};

/** Explicit hierarchy validation is shared by configuration and the read projection. */
export function energyHierarchyError(nodes: { id: string; parentId: string | null }[]): "unknownParent" | "meterCycle" | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId)) return "meterCycle";
      const parent = byId.get(parentId);
      if (!parent) return "unknownParent";
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }
  return null;
}

/** Never add a parent and its included child meters. Other is a residual, not another measurement. */
export function energyDistribution(totalWh: number | null, readings: EnergyDistributionReading[]) {
  const invalid = energyHierarchyError(readings);
  if (invalid) return { branches: [], accountedWh: null, otherWh: null, excessWh: 0, error: invalid };
  const build = (reading: EnergyDistributionReading): EnergyDistributionBranch => {
    const children = readings.filter((child) => child.parentId === reading.id).map(build);
    const childWh = children.reduce((sum, child) => sum + child.accountedWh, 0);
    const excessWh = reading.energyWh === null ? 0 : Math.max(0, childWh - reading.energyWh);
    return { ...reading, children, accountedWh: reading.energyWh ?? childWh, otherWh: reading.energyWh === null || excessWh > 0 ? null : reading.energyWh - childWh, excessWh };
  };
  const branches = readings.filter((reading) => reading.parentId === null).map(build);
  const accountedWh = branches.reduce((sum, branch) => sum + branch.accountedWh, 0);
  const excessWh = totalWh === null ? 0 : Math.max(0, accountedWh - totalWh);
  return { branches, accountedWh, otherWh: totalWh === null || excessWh > 0 ? null : totalWh - accountedWh, excessWh, error: null };
}
