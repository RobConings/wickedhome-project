import type { TaskMaterials } from "@/features/tasks/types/tasks";
import { deleteItemsForTask, getMaterialStatusForTasks } from "../shopping/shopping.service";

/**
 * Materials of tasks: shopping items with `source: "task"` and `taskId`, owned by the shopping feature.
 * The only place tasks ask about them; readiness follows from the result (`taskReadiness`).
 * Tasks without materials are absent from the result.
 */
export function loadTaskMaterials(householdId: string, taskIds: string[]): Promise<Record<string, TaskMaterials>> {
  return getMaterialStatusForTasks(householdId, taskIds);
}

/** A deleted task takes its materials off the shopping lists (soft reference, no FK cascade). */
export async function deleteTaskMaterials(householdId: string, taskId: string): Promise<void> {
  await deleteItemsForTask(householdId, taskId);
}
