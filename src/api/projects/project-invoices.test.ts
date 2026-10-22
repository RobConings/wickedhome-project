/**
 * Unit tests for materials on an invoice: the budget never counts a linked material twice nor loses it, the
 * check of a reader's answer (only known materials and lines, one per material and line, unit prices) and the
 * choice of the invoice among an expense's documents. No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/projects/project-invoices.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentFile } from "@/features/documents/types/documents";
import { budgetMaterialsOf, computeProjectBudget, unitPriceFor } from "@/features/projects/types/project-budget";
import { projectExpenseMaterialsInputSchema } from "@/features/projects/types/projects";
import { checkInvoiceReading, type InvoiceMaterial } from "./invoice-readers";
import { invoiceCandidates } from "./project-invoices";

describe("budget with materials on an invoice", () => {
  const materials = [
    { bought: true, lineCents: 79_900, expenseId: "x-spa" },
    { bought: true, lineCents: 53_900, expenseId: "x-spa" },
    { bought: false, lineCents: 2_250, expenseId: null },
  ];

  it("counts the paid invoice once, and only the materials not on it", () => {
    const budget = computeProjectBudget(200_000, [{ amountCents: 133_800, paid: true }], budgetMaterialsOf(materials, new Set(["x-spa"])));
    assert.equal(budget.spentCents, 133_800);
    assert.equal(budget.committedCents, 2_250);
    assert.equal(budget.breakdown.materialsBoughtCents, 0);
  });

  it("counts the unpaid invoice as committed, not its materials", () => {
    const budget = computeProjectBudget(null, [{ amountCents: 133_800, paid: false }], budgetMaterialsOf(materials, new Set(["x-spa"])));
    assert.equal(budget.spentCents, 0);
    assert.equal(budget.committedCents, 133_800 + 2_250);
  });

  it("counts the materials again when their invoice isn't counted by the project (unlinked or deleted)", () => {
    const budget = computeProjectBudget(null, [], budgetMaterialsOf(materials, new Set()));
    assert.equal(budget.spentCents, 79_900 + 53_900);
    assert.equal(budget.committedCents, 2_250);
  });

  it("leaves materials on an invoice out of the unpriced count", () => {
    const budget = computeProjectBudget(null, [{ amountCents: 1_000, paid: true }], budgetMaterialsOf([{ bought: true, lineCents: null, expenseId: "x" }], new Set(["x"])));
    assert.equal(budget.unpricedMaterials, 0);
  });
});

describe("unitPriceFor", () => {
  it("divides an invoice line by the quantity, rounded to cents", () => {
    assert.equal(unitPriceFor(2_250, 1), 2_250);
    assert.equal(unitPriceFor(1_000, 3), 333);
    assert.equal(unitPriceFor(1_000, 0), 1_000);
  });
});

describe("checkInvoiceReading", () => {
  const materials: InvoiceMaterial[] = [
    { id: "m-pump", name: "Heat pump", quantity: 1, unit: null, lineCents: 79_900 },
    { id: "m-salt", name: "Bath salt", quantity: 2, unit: null, lineCents: 2_250 },
  ];

  it("keeps known materials on existing positive lines, with the unit price", () => {
    const result = checkInvoiceReading(
      {
        lines: [
          { description: "Heat pump 7 kW", quantity: 1, totalCents: 78_900 },
          { description: "Bath salt", quantity: 2, totalCents: 2_500 },
          { description: "Discount", totalCents: -1_000 },
        ],
        matches: [
          { itemId: "m-pump", lineIndex: 0, confidence: 0.9 },
          { itemId: "m-salt", lineIndex: 1, confidence: 0.7 },
          { itemId: "m-other-project", lineIndex: 1, confidence: 1 },
          { itemId: "m-pump", lineIndex: 2, confidence: 0.95 },
          { itemId: "m-salt", lineIndex: 9, confidence: 1 },
        ],
      },
      materials,
    );
    assert.equal(result.lines.length, 3);
    assert.deepEqual(result.matches, [
      { itemId: "m-pump", lineIndex: 0, confidence: 0.9, priceCents: 78_900 },
      { itemId: "m-salt", lineIndex: 1, confidence: 0.7, priceCents: 1_250 },
    ]);
    assert.deepEqual(result.unmatchedLines, []);
  });

  it("gives each line and each material one match, the most confident first", () => {
    const result = checkInvoiceReading(
      {
        lines: [
          { description: "Pump", totalCents: 100 },
          { description: "Salt", totalCents: 200 },
        ],
        matches: [
          { itemId: "m-salt", lineIndex: 0, confidence: 0.4 },
          { itemId: "m-pump", lineIndex: 0, confidence: 0.8 },
        ],
      },
      materials,
    );
    assert.deepEqual(
      result.matches.map((match) => match.itemId),
      ["m-pump"],
    );
    assert.deepEqual(result.unmatchedLines, [1]);
  });

  it("drops empty or zero lines and re-numbers the matches", () => {
    const result = checkInvoiceReading(
      {
        lines: [
          { description: "  ", totalCents: 500 },
          { description: "Subtotal", totalCents: 0 },
          { description: "Bath  salt", quantity: -1, totalCents: 2_250 },
        ],
        matches: [{ itemId: "m-salt", lineIndex: 2, confidence: null }],
      },
      materials,
    );
    assert.deepEqual(result.lines, [{ description: "Bath salt", quantity: 1, totalCents: 2_250 }]);
    assert.deepEqual(result.matches, [{ itemId: "m-salt", lineIndex: 0, confidence: 0.5, priceCents: 1_125 }]);
  });
});

describe("invoiceCandidates", () => {
  const file = (id: string, mimeType: string, sizeBytes = 1000) => ({ id, name: id, mimeType, sizeBytes }) as DocumentFile;

  it("prefers the mail's PDF, then other PDFs, then photos; leaves out other files", () => {
    const result = invoiceCandidates(
      [file("photo", "image/jpeg"), file("pdf-upload", "application/pdf"), file("pdf-mail", "application/pdf"), file("sheet", "text/csv"), file("heic", "image/heic")],
      new Set(["pdf-mail"]),
    );
    assert.deepEqual(
      result.map((candidate) => `${candidate.kind}:${candidate.file.id}`),
      ["pdf:pdf-mail", "pdf:pdf-upload", "image:photo"],
    );
  });

  it("leaves out files that are too large", () => {
    assert.equal(invoiceCandidates([file("big", "application/pdf", 30 * 1024 * 1024)], new Set()).length, 0);
  });
});

describe("projectExpenseMaterialsInputSchema", () => {
  it("defaults to marking bought, and allows an empty set (everything off the invoice)", () => {
    assert.deepEqual(projectExpenseMaterialsInputSchema.parse({}), { itemIds: [], prices: [], newItems: [], markBought: true });
  });

  it("refuses negative prices", () => {
    assert.equal(projectExpenseMaterialsInputSchema.safeParse({ prices: [{ itemId: "cm1", priceCents: -1 }] }).success, false);
  });
});
