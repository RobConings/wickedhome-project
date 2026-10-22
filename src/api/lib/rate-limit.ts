import { HttpError } from "./http";

export class RateLimitError extends HttpError {
  constructor(readonly retryAfter: number, readonly limit: number, readonly windowMs: number) {
    super(429, "too_many_requests", "Too many attempts, try again later", undefined, retryAfter);
  }
}

/**
 * Small in-memory fixed-window limiter. Enough for a single-process household app;
 * resets on restart, which is acceptable.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    hit(key: string) {
      const at = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= at) {
        hits.set(key, { count: 1, resetAt: at + windowMs });
        return;
      }
      if (entry.count >= limit) {
        throw new RateLimitError(Math.max(1, Math.ceil((entry.resetAt - at) / 1000)), limit, windowMs);
      }
      entry.count += 1;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
