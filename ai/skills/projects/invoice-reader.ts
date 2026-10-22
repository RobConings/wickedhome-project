import { z } from "zod";
import { registerInvoiceLineReader, type InvoiceReaderAnswer, type InvoiceReaderInput } from "@/api/projects/invoice-readers";
import { readAssistantSettings } from "@ai/core/assistant-config";
import { DEFAULT_TIMEOUTS, createOpenAiChatModel, type ChatContentPart } from "@ai/core/llm-client";
import { queuedModel } from "@ai/core/model-queue";

/*
 * The household's language model as the invoice line reader of projects (src/api/projects/invoice-readers.ts):
 * it reads an invoice (PDF text, or a photo when the model sees images) into lines and says which of the
 * project's materials are on which line. The API checks the answer and the person confirms in the dialog
 * ("Read invoice with AI") or on the assistant's card (`projects_link_invoice`), so a wrong match is never
 * applied by itself. Someone waits for it: a chat's priority in the model queue.
 */

/** Longest the model may take once it runs. */
const READ_TIMEOUT_MS = 90_000;
/** Invoice text sent (a ~16k-token context). */
const TEXT_CHARS = 9000;
const MAX_MATERIALS = 60;

const SYSTEM = [
  "You read invoices and receipts (Dutch, French or English) and match their lines to a list of materials. Answer with one JSON object only, no other text:",
  '{"lines":[{"description":string,"quantity":number,"totalEur":number}],"matches":[{"material":"m1","line":1,"confidence":number}]}',
  "- lines: every product or service line of the invoice, in order, numbered from 1 in that order. totalEur = what the line costs in total INCLUDING VAT (if the invoice only shows prices excl. VAT, add the VAT rate printed). A discount line has a negative total. Leave out subtotals, VAT lines, shipping-free notes and the grand total.",
  "- matches: a material that is the same thing as a line (names may differ: brand names, abbreviations, Dutch vs English). confidence 0-1: 0.9 sure, 0.6 likely, below 0.5 a guess. Each material and each line at most once. No match: leave it out.",
  "- Only use what is printed. Never invent lines or prices.",
].join("\n");

const answerSchema = z.object({
  lines: z
    .array(
      z.object({
        description: z.string().max(300),
        quantity: z.number().nullable().optional(),
        totalEur: z.number(),
      }),
    )
    .max(200),
  matches: z
    .array(z.object({ material: z.string().max(10), line: z.number().int(), confidence: z.number().nullable().optional() }))
    .max(200)
    .default([]),
});

/** The first JSON object in a model's answer (it may wrap it in ``` fences or a sentence), with materials mapped back to ids. */
export function parseInvoiceAnswer(content: string, materialIds: readonly string[]): InvoiceReaderAnswer | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = answerSchema.safeParse(JSON.parse(content.slice(start, end + 1)));
    if (!parsed.success) return null;
    return {
      lines: parsed.data.lines.map((line) => ({ description: line.description, quantity: line.quantity ?? 1, totalCents: Math.round(line.totalEur * 100) })),
      matches: parsed.data.matches.flatMap((match) => {
        const itemId = materialIds[Number(match.material.replace(/^m/i, "")) - 1];
        return itemId ? [{ itemId, lineIndex: match.line - 1, confidence: match.confidence ?? 0.5 }] : [];
      }),
    };
  } catch {
    return null;
  }
}

const euros = (cents: number | null) => (cents === null ? "no price" : `€ ${(cents / 100).toFixed(2)}`);

export function invoicePrompt(input: InvoiceReaderInput, materials: InvoiceReaderInput["materials"]): string {
  const list = materials.map(
    (material, index) => `m${index + 1}: ${material.name}${material.quantity !== 1 ? ` ×${material.quantity}${material.unit ? ` ${material.unit}` : ""}` : ""} (expected ${euros(material.lineCents)})`,
  );
  return [
    `Invoice from ${input.payee}, ${input.date}, total ${euros(input.amountCents)}.`,
    `--- MATERIALS ---\n${list.join("\n") || "(none: just read the lines)"}`,
    input.imageDataUrl ? "--- INVOICE: see the image ---" : `--- INVOICE ---\n${input.text.slice(0, TEXT_CHARS)}`,
  ].join("\n\n");
}

registerInvoiceLineReader({
  id: "assistant",
  available: () => readAssistantSettings().problem === null,
  readsImages: () => readAssistantSettings().vision,
  async read(input, signal) {
    const settings = readAssistantSettings();
    if (settings.problem) return null;
    const materials = input.materials.slice(0, MAX_MATERIALS);
    const timeouts = { ...(settings.timeouts ?? DEFAULT_TIMEOUTS), totalMs: READ_TIMEOUT_MS };
    // Someone waits in the dialog (or the chat): ahead of the mail scan in the model queue.
    const model = queuedModel(createOpenAiChatModel({ ...settings, thinking: false, timeouts }), { priority: "chat" });
    const text = invoicePrompt(input, materials);
    const content: string | ChatContentPart[] = input.imageDataUrl ? [{ type: "text", text }, { type: "image_url", image_url: { url: input.imageDataUrl } }] : text;
    const result = await model({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      signal,
    });
    return parseInvoiceAnswer(
      result.content,
      materials.map((material) => material.id),
    );
  },
});
