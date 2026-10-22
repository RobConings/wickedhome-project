import type { Task } from "./tasks";

/**
 * How many open tasks of the list a task waits for, directly or through others: 0 for tasks that can start,
 * 1 for "Start tiling" that waits for "Buy materials", and so on. Orders a project's tasks as a chain.
 */
export function chainDepths(tasks: Pick<Task, "id" | "waitingFor">[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depths = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const task = byId.get(id);
    if (!task || seen.has(id)) return 0;
    seen.add(id);
    const blockers = task.waitingFor.filter((other) => byId.has(other.id));
    const depth = blockers.length === 0 ? 0 : 1 + Math.max(...blockers.map((other) => depthOf(other.id, seen)));
    depths.set(id, depth);
    return depth;
  };
  for (const task of tasks) depthOf(task.id, new Set());
  return depths;
}
