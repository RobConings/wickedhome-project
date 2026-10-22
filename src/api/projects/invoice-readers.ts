import { unitPriceFor } from "@/features/projects/types/project-budget";
import { MAX_INVOICE_LINES, type InvoiceLine, type InvoiceMatch } from "@/features/projects/types/projects";

/*
 * Invoice line readers: something that reads an invoice's lines and says which project materials are on them
 * (the household's own language model, registered by the assistant from ai/; projects never imports it). The
 * API asks the first available reader and checks its answer (`checkInvoiceReading`): only materials it sent,
 * only lines that exist, one material per line. What it proposes is never applied without the person.
 */

/** A material the reader may match, as sent to it. */
export type InvoiceMaterial = { id: string; name: string; quantity: number; unit: string | null; lineCents: number | null };

export type InvoiceReaderInput = {
  payee: string;
  amountCents: number;
  /** `YYYY-MM-DD`: paid on, else due. */
  date: string;
  /** The PDF's text; "" for an image. */
  text: string;
  /** A photo or scan of the invoice as a `data:` URL; null for a PDF. */
  imageDataUrl: string | null;
  materials: InvoiceMaterial[];
};

/** A reader's answer, before it is checked. */
export type InvoiceReaderAnswer = {
  lines: { description: string; quantity?: number | null; totalCents: number }[];
  matches: { itemId: string; lineIndex: number; confidence?: number | null }[];
};

export type InvoiceLineReader = {
  id: string;
  /** Whether it can read now (the assistant is configured). Cheap: checked on every project page. */
  available: () => boolean;
  /** Whether it can read a photo (a vision model). */
  readsImages: () => boolean;
  /** What it read, or null when it couldn't make sense of the answer. Throws when the model fails. */
  read: (input: InvoiceReaderInput, signal: AbortSignal) => Promise<InvoiceReaderAnswer | null>;
};

const readers = new Map<string, InvoiceLineReader>();

export function registerInvoiceLineReader(reader: InvoiceLineReader): void {
  readers.set(reader.id, reader);
}

/** The first reader that can read now, if any. */
export function availableInvoiceReader(): InvoiceLineReader | null {
  for (const reader of readers.values()) if (reader.available()) return reader;
  return null;
}

const MAX_LINE_CENTS = 100_000_000;

/**
 * A reader's answer as the API returns it: lines with a description and a total (discounts may be negative),
 * matches only for the materials sent and existing lines with a positive total, one per material and per line
 * (the most confident wins), each with the price per unit that line gives the material.
 */
export function checkInvoiceReading(
  answer: InvoiceReaderAnswer,
  materials: readonly InvoiceMaterial[],
): { lines: InvoiceLine[]; matches: InvoiceMatch[]; unmatchedLines: number[] } {
  // Indexes refer to the reader's lines; keep a map to the lines that survive.
  const indexMap = new Map<number, number>();
  const lines: InvoiceLine[] = [];
  answer.lines.forEach((line, index) => {
    if (lines.length >= MAX_INVOICE_LINES) return;
    const description = String(line.description ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const total = Number(line.totalCents);
    if (!description || !Number.isInteger(total) || total === 0 || Math.abs(total) > MAX_LINE_CENTS) return;
    const quantity = Number(line.quantity);
    indexMap.set(index, lines.length);
    lines.push({ description, quantity: Number.isFinite(quantity) && quantity > 0 && quantity <= 10_000 ? quantity : 1, totalCents: total });
  });

  const byId = new Map(materials.map((material) => [material.id, material]));
  const candidates = answer.matches
    .map((match) => ({
      itemId: String(match.itemId),
      lineIndex: indexMap.get(Number(match.lineIndex)),
      // No confidence given: a likely match (the person checks it anyway).
      confidence: typeof match.confidence === "number" && Number.isFinite(match.confidence) ? Math.min(1, Math.max(0, match.confidence)) : 0.5,
    }))
    .filter((match): match is { itemId: string; lineIndex: number; confidence: number } => byId.has(match.itemId) && match.lineIndex !== undefined)
    .filter((match) => (lines[match.lineIndex]?.totalCents ?? 0) > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const usedItems = new Set<string>();
  const usedLines = new Set<number>();
  const matches: InvoiceMatch[] = [];
  for (const match of candidates) {
    if (usedItems.has(match.itemId) || usedLines.has(match.lineIndex)) continue;
    usedItems.add(match.itemId);
    usedLines.add(match.lineIndex);
    const line = lines[match.lineIndex] as InvoiceLine;
    const material = byId.get(match.itemId) as InvoiceMaterial;
    matches.push({ ...match, confidence: Math.round(match.confidence * 100) / 100, priceCents: unitPriceFor(line.totalCents, material.quantity) });
  }
  const unmatchedLines = lines.flatMap((line, index) => (line.totalCents > 0 && !usedLines.has(index) ? [index] : []));
  return { lines, matches, unmatchedLines };
}
