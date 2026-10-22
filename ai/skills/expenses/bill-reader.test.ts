/**
 * Reading the model's answer for the mail scan. No model needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/expenses/bill-reader.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReading } from "./bill-reader";

describe("parseReading", () => {
  it("reads the JSON object, also inside fences or a sentence", () => {
    assert.deepEqual(parseReading('```json\n{"amountEur": 137, "dueDate": "2026-10-14", "structuredCommunication": null, "iban": null}\n```'), {
      amountEur: 137,
      dueDate: "2026-10-14",
      structuredCommunication: null,
      iban: null,
    });
    assert.equal(parseReading('Here it is: {"amountEur": 62.5}')?.amountEur, 62.5);
  });

  it("nothing usable is null", () => {
    assert.equal(parseReading("I can't read this invoice."), null);
    assert.equal(parseReading('{"amountEur": "veel"}'), null);
  });
});
