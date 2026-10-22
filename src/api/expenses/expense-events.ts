/*
 * In-process notifications when expenses change, so other API features (e.g. the tasks feature's "Pay …"
 * tasks, src/api/tasks/pay-tasks.ts) can stay in sync without the expenses feature depending on them.
 *
 *   import { onExpenseChanged } from "../expenses/expense-events";
 *   const stop = onExpenseChanged(async ({ householdId, expenseId, change }) => { … });
 *
 * Fired after the change is committed: create/update/delete of an expense, mark paid/unpaid (including the
 * direct-debit job), and for every instance a recurring expense created, regenerated or removed (edits,
 * pause/end/resume, delete). A listener that throws is logged; it never breaks the expense request.
 */
export type ExpenseChange = "created" | "updated" | "paid" | "unpaid" | "deleted";

export type ExpenseChangedEvent = { householdId: string; expenseId: string; change: ExpenseChange };

type Listener = (event: ExpenseChangedEvent) => Promise<void> | void;

const listeners = new Set<Listener>();

/** Subscribes to expense changes; returns the unsubscribe function. */
export function onExpenseChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifies every listener, one event per expense id, in order. Never throws. */
export async function emitExpenseChanged(householdId: string, expenseIds: string | readonly string[], change: ExpenseChange) {
  const ids = typeof expenseIds === "string" ? [expenseIds] : expenseIds;
  if (ids.length === 0 || listeners.size === 0) return;
  for (const expenseId of ids) {
    for (const listener of listeners) {
      try {
        await listener({ householdId, expenseId, change });
      } catch (error) {
        console.error(`[expenses] expense-changed listener failed (${change} ${expenseId})`, error);
      }
    }
  }
}
