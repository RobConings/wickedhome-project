/**
 * A bill reader's values count only when the texts back them up. Pure:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/integrations/bill-readers.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyReading } from "./bill-readers";
import type { ExtractedBill } from "./gmail-extract";

const pdf = "Factuur 20263162\nTotaal excl. BTW € 130,00\nBTW 6% € 7,00\nTotaal incl. BTW € 137,00\nVervaldag 14/10/2026\nMededeling +++012/3456/78939+++\nBE68 5390 0754 7034";
const extracted: ExtractedBill = { amountCents: 13000, dueDate: null, structuredCommunication: null, iban: null };

describe("verifyReading", () => {
  it("takes the reader's values that appear in the texts", () => {
    const result = verifyReading(extracted, { amountCents: 13700, dueDate: "2026-10-14", structuredCommunication: "+++012/3456/78939+++", iban: "BE68539007547034" }, [pdf], "2026-10-06");
    assert.deepEqual(result, { amountCents: 13700, dueDate: "2026-10-14", structuredCommunication: "012345678939", iban: "BE68539007547034" });
  });

  it("ignores invented or invalid values and keeps the extraction", () => {
    const result = verifyReading(extracted, { amountCents: 14500, dueDate: "2026-11-30", structuredCommunication: "+++111/2222/33333+++", iban: "BE00123" }, [pdf], "2026-10-06");
    assert.deepEqual(result, extracted);
  });

  it("an implausible due date doesn't count, even when it is printed", () => {
    assert.equal(verifyReading(extracted, { dueDate: "2026-10-14" }, [pdf], "2025-01-01").dueDate, null);
  });
});
