import { onCalendarEventChanged } from "../calendar/calendar-events";
import { publishChangedEvents } from "./google-calendar.service";

/*
 * Instant publishing: when a household event is created, edited or deleted, it is pushed to (or removed from)
 * Google Calendar a few seconds later, instead of waiting for the 15-minute `integrations.google-calendar` job,
 * which stays as the safety net and reconciles everything.
 *
 * Calendar → integrations only through `onCalendarEventChanged`; the calendar feature never imports this.
 * Changes are collected per household and pushed together after a quiet period (a burst of edits is one push),
 * outside the request. Pushes of one household run one after the other.
 */

/** Quiet period after the last change before pushing. */
export const PUSH_DELAY_MS = 3000;
/** A household that keeps editing is still pushed at least this often. */
export const PUSH_MAX_WAIT_MS = 30_000;

type Run = (householdId: string, eventIds: string[]) => Promise<unknown>;

/** Per-household debounce of event ids; `run` gets every id changed since the previous push. */
export function createHouseholdDebouncer(run: Run, { delayMs, maxWaitMs = Number.POSITIVE_INFINITY }: { delayMs: number; maxWaitMs?: number }) {
  const pending = new Map<string, { ids: Set<string>; firstAt: number; timer: ReturnType<typeof setTimeout> }>();
  const running = new Map<string, Promise<void>>();

  function flush(householdId: string) {
    const entry = pending.get(householdId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(householdId);
    const ids = [...entry.ids];
    const previous = running.get(householdId) ?? Promise.resolve();
    const current = previous
      .then(() => run(householdId, ids))
      .then(
        () => undefined,
        (error: unknown) => console.error(`[integrations] instant publish failed (household ${householdId})`, error),
      );
    running.set(householdId, current);
    void current.then(() => {
      if (running.get(householdId) === current) running.delete(householdId);
    });
  }

  return {
    schedule(householdId: string, eventId: string) {
      const now = Date.now();
      const entry = pending.get(householdId);
      if (entry) clearTimeout(entry.timer);
      const ids = entry?.ids ?? new Set<string>();
      ids.add(eventId);
      const firstAt = entry?.firstAt ?? now;
      const wait = Math.max(0, Math.min(delayMs, firstAt + maxWaitMs - now));
      const timer = setTimeout(() => flush(householdId), wait);
      timer.unref?.();
      pending.set(householdId, { ids, firstAt, timer });
    },
    /** Pushes everything scheduled now and waits for all pushes to finish (tests, shutdown). */
    async flushAll() {
      for (const householdId of [...pending.keys()]) flush(householdId);
      await Promise.all([...running.values()]);
    },
    /** Event ids waiting for their push, per household. */
    pendingIds: (householdId: string) => [...(pending.get(householdId)?.ids ?? [])],
  };
}

export const googlePublishQueue = createHouseholdDebouncer(publishChangedEvents, { delayMs: PUSH_DELAY_MS, maxWaitMs: PUSH_MAX_WAIT_MS });

// Subscribe once; a dev-server reload replaces the previous subscription.
const SUBSCRIPTION = Symbol.for("wickedhome.googleCalendar.eventListener");
const registry = globalThis as typeof globalThis & { [SUBSCRIPTION]?: () => void };
registry[SUBSCRIPTION]?.();
registry[SUBSCRIPTION] = onCalendarEventChanged(({ householdId, eventId }) => googlePublishQueue.schedule(householdId, eventId));
