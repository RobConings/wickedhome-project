/** The invoice reader's answer parsing and prompt (no model needed). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invoicePrompt, parseInvoiceAnswer } from "./invoice-reader";

describe("parseInvoiceAnswer", () => {
  it("maps m1… back to ids, lines to cents and 1-based line numbers to indexes", () => {
    const answer = parseInvoiceAnswer(
      'Here: ```json\n{"lines":[{"description":"Heat pump","quantity":1,"totalEur":789.5}],"matches":[{"material":"m2","line":1,"confidence":0.9},{"material":"m7","line":1}]}\n```',
      ["a", "b"],
    );
    assert.deepEqual(answer, { lines: [{ description: "Heat pump", quantity: 1, totalCents: 78_950 }], matches: [{ itemId: "b", lineIndex: 0, confidence: 0.9 }] });
  });

  it("gives null for no JSON or the wrong shape", () => {
    assert.equal(parseInvoiceAnswer("I can't read it", []), null);
    assert.equal(parseInvoiceAnswer('{"lines":"none"}', []), null);
  });
});

describe("invoicePrompt", () => {
  it("lists the materials as m1… and the invoice text", () => {
    const input = {
      payee: "Spa Center",
      amountCents: 169_845,
      date: "2026-10-09",
      text: "Heat pump 789,00",
      imageDataUrl: null,
      materials: [{ id: "x", name: "Spa heat pump", quantity: 1, unit: null, lineCents: 79_900 }],
    };
    const prompt = invoicePrompt(input, input.materials);
    assert.match(prompt, /m1: Spa heat pump \(expected € 799\.00\)/);
    assert.match(prompt, /Heat pump 789,00/);
  });
});
