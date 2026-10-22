/**
 * Envelope of every live event on the household stream (`GET /api/events`, Server-Sent Events). The SSE
 * `event:` name equals `type`; the SSE `data:` line is this object as JSON. Published by
 * `publish()` in src/api/lib/events.ts, received with `useLiveEvents()` from src/lib/live-events.ts.
 */
export type LiveEvent<T = unknown> = {
  /** Dotted name, `<feature>.<what>`: `device.value`, `device.changed`, later `alarm.state`… */
  type: string;
  /** ISO timestamp of publication. */
  at: string;
  data: T;
};

/** Sent once each time a stream (re)opens. Events are not replayed, so reload data on `ready`. */
export const LIVE_READY_EVENT = "ready";
