import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRateLimiter, RateLimitError } from "./rate-limit";

describe("rate limit retry times", () => {
  it("reports the remaining window in whole seconds and expires exactly at the reset time", () => {
    let now = 1000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    limiter.hit("a");
    limiter.hit("a");
    now += 12_001;
    assert.throws(() => limiter.hit("a"), (error) => error instanceof RateLimitError && error.status === 429 && error.retryAfterSeconds === 48);
    now = 60_999;
    assert.throws(() => limiter.hit("a"), (error) => error instanceof RateLimitError && error.retryAfter === 1);
    now = 61_000;
    assert.doesNotThrow(() => limiter.hit("a"));
  });

  it("keeps independent budgets and supports an explicit reset", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    limiter.hit("a");
    assert.throws(() => limiter.hit("a"), RateLimitError);
    assert.doesNotThrow(() => limiter.hit("b"));
    limiter.reset("a");
    assert.doesNotThrow(() => limiter.hit("a"));
  });
});
