import type { TaskOutcome } from "@/features/tasks/types/tasks";

/**
 * What an origin feature wants to hear when people act on its linked tasks, e.g. expenses: completing a
 * pay task marks the expense paid, undoing it marks it unpaid again. Registered once from the feature's
 * routes file: `registerLinkedTaskHandler("expense", { onClosed, onReopened })`.
 *
 * Handlers run after the task change is saved. A handler that throws is logged; the task change stays.
 * Changes the origin itself makes through `completeLinkedTask` / `reopenLinkedTask` don't call back.
 */
export type LinkedTaskEvent = {
  householdId: string;
  taskId: string;
  originId: string;
  /** The account that acted, when a person did. */
  actorUserId: string | null;
};

export type LinkedTaskHandler = {
  onClosed?: (event: LinkedTaskEvent & { outcome: TaskOutcome; completedById: string | null }) => Promise<void> | void;
  onReopened?: (event: LinkedTaskEvent) => Promise<void> | void;
};

const handlers = new Map<string, LinkedTaskHandler>();

export function registerLinkedTaskHandler(originType: string, handler: LinkedTaskHandler): void {
  // Re-registering replaces (dev server reloads).
  handlers.set(originType, handler);
}

export async function notifyLinkedTaskClosed(
  originType: string,
  event: LinkedTaskEvent & { outcome: TaskOutcome; completedById: string | null },
): Promise<void> {
  try {
    await handlers.get(originType)?.onClosed?.(event);
  } catch (error) {
    console.error(`Linked task handler "${originType}" (closed) failed`, error);
  }
}

export async function notifyLinkedTaskReopened(originType: string, event: LinkedTaskEvent): Promise<void> {
  try {
    await handlers.get(originType)?.onReopened?.(event);
  } catch (error) {
    console.error(`Linked task handler "${originType}" (reopened) failed`, error);
  }
}
