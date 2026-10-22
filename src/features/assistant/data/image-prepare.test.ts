/**
 * The size an attached image is scaled to before upload (pure). Run on the server:
 *
 *   npx tsx --test src/features/assistant/data/image-prepare.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitWithin } from "./image-prepare";

describe("fitWithin", () => {
  it("scales the longest side down to the limit, keeping the ratio", () => {
    assert.deepEqual(fitWithin(6000, 3656, 2048), { width: 2048, height: 1248 });
    assert.deepEqual(fitWithin(1000, 4000, 2048), { width: 512, height: 2048 });
  });

  it("never enlarges a small image", () => {
    assert.deepEqual(fitWithin(800, 600, 2048), { width: 800, height: 600 });
  });
});
