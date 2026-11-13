import * as React from "react";

/** The current time, refreshed every `intervalMs`, so "stale" and "5 min ago" stay true without reloads. */
export function useNow(intervalMs = 60_000, initial?: number): number {
  const [now, setNow] = React.useState(() => initial ?? Date.now());
  React.useEffect(() => {
    if (initial !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, initial]);
  return now;
}
