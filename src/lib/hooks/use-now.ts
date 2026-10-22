import * as React from "react";

/**
 * The current time (ms), refreshed every `intervalMs`, so "stale", "5 min ago" and "now" lines stay true
 * without reloads. A fixed `initial` (stories, tests) never changes.
 */
export function useNow(intervalMs = 60_000, initial?: number): number {
  const [now, setNow] = React.useState(() => initial ?? Date.now());
  React.useEffect(() => {
    if (initial !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, initial]);
  return now;
}
