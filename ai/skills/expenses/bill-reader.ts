import { z } from "zod";
import { registerBillReader, type BillReaderInput } from "@/api/integrations/bill-readers";
import { readAssistantSettings } from "@ai/core/assistant-config";
import { DEFAULT_TIMEOUTS, createOpenAiChatModel } from "@ai/core/llm-client";
import { queuedModel } from "@ai/core/model-queue";

/*
 * The household's language model as a bill reader for the mail scan (src/api/integrations/bill-readers.ts):
 * when the assistant is configured, it reads each new bill mail's PDF text and mail text and says what to pay.
 * The scan keeps only what the texts confirm, so this can only correct the pattern extraction (e.g. the total
 * with VAT instead of the subtotal), never invent a value. Not configured, unreachable or slow: no reading.
 */

/**
 * Longest a reading may take once it runs (waiting behind chats in the model queue doesn't count); the scan
 * carries on with the pattern extraction after it.
 */
const READ_TIMEOUT_MS = 90_000;
/** Text sent per mail (a ~16k-token context): the invoice first. */
const PDF_CHARS = 9000;
const MAIL_CHARS = 2500;

const SYSTEM = [
  "You read Belgian bills and invoices (Dutch, French or English). Answer with one JSON object only, no other text:",
  '{"amountEur": number|null, "dueDate": "YYYY-MM-DD"|null, "structuredCommunication": string|null, "iban": string|null}',
  "- amountEur: the total to pay INCLUDING VAT, as printed on the invoice (the PDF). Never a subtotal or amount excluding VAT (excl. btw, HTVA), never the VAT amount itself.",
  "- The invoice (PDF) is right; the mail text is only a fallback. Ignore mail sentences like 'pay € 0 if you already paid the technician'.",
  "- dueDate: the due date (vervaldag, échéance), not the invoice date. structuredCommunication: +++123/4567/89012+++ style. iban: the account to pay to.",
  "- Use null for anything not printed in the texts. Never guess.",
].join("\n");

const readingSchema = z.object({
  amountEur: z.number().positive().max(1_000_000).nullable().optional(),
  dueDate: z.string().max(10).nullable().optional(),
  structuredCommunication: z.string().max(40).nullable().optional(),
  iban: z.string().max(42).nullable().optional(),
});

/** The first JSON object in a model's answer (it may wrap it in ``` fences or a sentence). */
export function parseReading(content: string): z.infer<typeof readingSchema> | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = readingSchema.safeParse(JSON.parse(content.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const promptFor = (input: BillReaderInput) =>
  [
    `Sender: ${input.payee}. Received: ${input.receivedOn}. Subject: ${input.subject}`,
    `--- INVOICE (PDF) ---\n${input.pdfText.slice(0, PDF_CHARS) || "(no PDF text)"}`,
    `--- MAIL TEXT ---\n${input.mailText.slice(0, MAIL_CHARS) || "(empty)"}`,
  ].join("\n\n");

registerBillReader({
  id: "assistant",
  async read(input, signal) {
    const settings = readAssistantSettings();
    if (settings.problem) return null;
    if (!input.pdfText.trim() && !input.mailText.trim()) return null;
    // Background work: behind every chat in the model queue, so a scan never makes a chat wait or crash the
    // model server with two prompts at once.
    const timeouts = { ...(settings.timeouts ?? DEFAULT_TIMEOUTS), totalMs: READ_TIMEOUT_MS };
    const model = queuedModel(createOpenAiChatModel({ ...settings, thinking: false, timeouts }), { priority: "background" });
    const result = await model({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: promptFor(input) },
      ],
      signal: signal ?? new AbortController().signal,
    });
    const reading = parseReading(result.content);
    if (!reading) return null;
    return {
      amountCents: reading.amountEur ? Math.round(reading.amountEur * 100) : null,
      dueDate: reading.dueDate ?? null,
      structuredCommunication: reading.structuredCommunication ?? null,
      iban: reading.iban ?? null,
    };
  },
});
