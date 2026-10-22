import { normalizeIban, normalizeStructuredCommunication } from "@/features/expenses/types/payment-references";
import { isoDateSchema } from "@/types/common";
import { addDays, daysBetween } from "@/types/dates";
import { findDates, moneyTokens, type ExtractedBill } from "./gmail-extract";

/*
 * Bill readers: something smarter than the text patterns that reads a bill mail (the household's own language
 * model, registered by the assistant from ai/; integrations never imports it). The mail scan asks every reader
 * after its own extraction, and keeps a reader's value only when the texts back it up (`verifyReading`), so a
 * model can't invent an amount or a payment reference. A reader that fails or is slow changes nothing.
 */

export type BillReaderInput = {
  payee: string;
  subject: string;
  /** The mail body as plain text. */
  mailText: string;
  /** The PDF's text (the invoice itself), or "" when there is none or it couldn't be read. */
  pdfText: string;
  /** `YYYY-MM-DD`, household time zone. */
  receivedOn: string;
};

export type BillReader = {
  id: string;
  /** What it read, or null when it can't read now (not configured, unreachable). */
  read: (input: BillReaderInput, signal?: AbortSignal) => Promise<Partial<ExtractedBill> | null>;
};

const readers = new Map<string, BillReader>();

export function registerBillReader(reader: BillReader): void {
  readers.set(reader.id, reader);
}

const digitsOnly = (text: string) => text.replace(/\D/g, "");
const compact = (text: string) => text.replace(/[\s-]/g, "").toUpperCase();

/**
 * A reader's values that the texts confirm, over the pattern extraction: the amount must be a money amount in
 * the texts, the structured communication and IBAN must pass their checks and appear, the due date must appear
 * and be plausible (30 days before receipt to a year after). Anything else keeps the extraction's value.
 */
export function verifyReading(extracted: ExtractedBill, reading: Partial<ExtractedBill>, texts: string[], receivedOn: string): ExtractedBill {
  const all = texts.join("\n");
  const result = { ...extracted };
  const amount = reading.amountCents;
  if (typeof amount === "number" && Number.isInteger(amount) && amount > 0 && moneyTokens(all).some((token) => token.cents === amount)) {
    result.amountCents = amount;
  }
  const reference = reading.structuredCommunication ? normalizeStructuredCommunication(reading.structuredCommunication) : null;
  if (reference && digitsOnly(all).includes(reference)) result.structuredCommunication = reference;
  const iban = reading.iban ? normalizeIban(reading.iban) : null;
  if (iban && compact(all).includes(iban)) result.iban = iban;
  const due = reading.dueDate && isoDateSchema.safeParse(reading.dueDate).success ? reading.dueDate : null;
  if (
    due &&
    findDates(all).some((entry) => entry.date === due) &&
    daysBetween(addDays(receivedOn, -30), due) >= 0 &&
    daysBetween(due, addDays(receivedOn, 366)) >= 0
  ) {
    result.dueDate = due;
  }
  return result;
}

/** Asks the registered readers (first that answers wins) and verifies what it read; the extraction otherwise. */
export async function readWithReaders(input: BillReaderInput, extracted: ExtractedBill, signal?: AbortSignal): Promise<ExtractedBill> {
  for (const reader of readers.values()) {
    try {
      const reading = await reader.read(input, signal);
      if (reading) return verifyReading(extracted, reading, [input.pdfText, input.mailText, input.subject], input.receivedOn);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(`[google] bill reader "${reader.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return extracted;
}
