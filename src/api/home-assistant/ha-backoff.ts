/**
 * Reconnect delays for the Home Assistant WebSocket: exponential from 1 s, capped at 5 minutes, with
 * ±20 % jitter so a restarted Home Assistant isn't hit by every client in the same second. A rejected token
 * (`auth_invalid`) won't fix itself without a change to .env, so it waits the maximum straight away.
 */

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
export const BACKOFF_JITTER = 0.2;

/**
 * Delay before reconnect attempt `attempt` (0 = the first retry after a drop). `random` is injectable for
 * tests (0..1; 0.5 = no jitter).
 */
export function nextBackoffMs(
  attempt: number,
  { authFailed = false, random = Math.random }: { authFailed?: boolean; random?: () => number } = {},
): number {
  const exponent = Math.max(0, Math.min(attempt, 20));
  const base = authFailed ? BACKOFF_MAX_MS : Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
  const jitter = 1 + (random() * 2 - 1) * BACKOFF_JITTER;
  return Math.round(Math.min(BACKOFF_MAX_MS * (1 + BACKOFF_JITTER), Math.max(BACKOFF_BASE_MS / 2, base * jitter)));
}
