import type { DocumentFile } from "@/features/documents/types/documents";
import type { ProjectInvoiceReading } from "@/features/projects/types/projects";
import { listLinkedFiles, openFileContent } from "../documents/documents.service";
import { listMailOrigins } from "../integrations/gmail.service";
import { extractPdfText } from "../integrations/pdf-text";
import { db } from "../lib/db";
import { HttpError, notFound } from "../lib/http";
import { availableInvoiceReader, checkInvoiceReading, type InvoiceMaterial } from "./invoice-readers";
import { listProjectMaterials } from "./projects.service";

/*
 * "Read invoice with AI": finds the invoice of an expense of a project (a PDF attached to it, the PDF of the
 * mail it came from first, else a photo or scan), reads its text, and asks the invoice line reader
 * (invoice-readers.ts) for its lines and which of the project's materials are on them. Read only: the
 * dialog shows the proposal and the person decides.
 */

/** Longest a reading may take (the reader's own limit; this one also covers fetching the file). */
const READ_TIMEOUT_MS = 95_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Photos a vision model reads (HEIC and others are left out). */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const readError = (status: number, code: string, message: string) => new HttpError(status, code, message);

/** The documents of an expense that could be its invoice, best first: mail PDFs, other PDFs (newest first), then photos. */
export function invoiceCandidates(files: readonly DocumentFile[], mailFileIds: ReadonlySet<string>): { file: DocumentFile; kind: "pdf" | "image" }[] {
  const pdfs = files.filter((file) => file.mimeType === "application/pdf" && file.sizeBytes <= MAX_PDF_BYTES);
  const images = files.filter((file) => IMAGE_TYPES.has(file.mimeType) && file.sizeBytes <= MAX_IMAGE_BYTES);
  const mailFirst = (list: DocumentFile[]) => [...list.filter((file) => mailFileIds.has(file.id)), ...list.filter((file) => !mailFileIds.has(file.id))];
  return [...mailFirst(pdfs).map((file) => ({ file, kind: "pdf" as const })), ...mailFirst(images).map((file) => ({ file, kind: "image" as const }))];
}

async function fileBytes(householdId: string, id: string): Promise<Buffer> {
  const { open } = await openFileContent(householdId, id);
  const chunks: Buffer[] = [];
  for await (const chunk of await open()) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/** Materials the invoice may be about: not yet on another invoice. */
async function readableMaterials(householdId: string, projectId: string, expenseId: string): Promise<InvoiceMaterial[]> {
  const materials = await listProjectMaterials(householdId, projectId);
  return materials
    .filter((material) => material.expenseId === null || material.expenseId === expenseId)
    .map((material) => ({ id: material.id, name: material.name, quantity: material.quantity, unit: material.unit, lineCents: material.lineCents }));
}

export async function readProjectInvoice(householdId: string, projectId: string, expenseId: string, signal?: AbortSignal): Promise<ProjectInvoiceReading> {
  const materials = await readableMaterials(householdId, projectId, expenseId);
  const expense = await db.expense.findFirst({
    where: { id: expenseId, householdId },
    select: { id: true, payee: true, amountCents: true, dueDate: true, paidOn: true },
  });
  if (!expense) throw notFound("Expense not found");
  const reader = availableInvoiceReader();
  if (!reader) throw readError(503, "reader_unavailable", "The assistant isn't set up, so invoices can't be read");

  const [files, origins] = await Promise.all([
    listLinkedFiles(householdId, { entityType: "bill", entityId: expense.id }),
    listMailOrigins(householdId, expense.id),
  ]);
  const candidates = invoiceCandidates(files, new Set(origins.map((origin) => origin.documentFileId)));
  if (candidates.length === 0) throw readError(404, "no_invoice", "This expense has no PDF or photo of the invoice attached");

  // The first PDF with text, else the first photo the reader can see.
  let source: { file: DocumentFile; kind: "pdf" | "image" } | null = null;
  let text = "";
  let imageDataUrl: string | null = null;
  for (const candidate of candidates) {
    if (candidate.kind === "pdf") {
      text = (await extractPdfText(new Uint8Array(await fileBytes(householdId, candidate.file.id)))).trim();
      if (text) {
        source = candidate;
        break;
      }
    } else if (reader.readsImages()) {
      imageDataUrl = `data:${candidate.file.mimeType};base64,${(await fileBytes(householdId, candidate.file.id)).toString("base64")}`;
      source = candidate;
      break;
    }
  }
  if (!source) throw readError(422, "invoice_unreadable", "The invoice has no readable text (a scan needs a photo and an image-capable model)");

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, READ_TIMEOUT_MS);
  try {
    const answer = await reader.read(
      {
        payee: expense.payee,
        amountCents: expense.amountCents,
        date: (expense.paidOn ?? expense.dueDate).toISOString().slice(0, 10),
        text,
        imageDataUrl,
        materials,
      },
      controller.signal,
    );
    if (!answer) throw readError(502, "reader_failed", "The model's answer couldn't be read");
    const checked = checkInvoiceReading(answer, materials);
    if (checked.lines.length === 0) throw readError(502, "reader_failed", "No invoice lines were found");
    return { source: { fileId: source.file.id, name: source.file.name, kind: source.kind }, ...checked };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal?.aborted) throw error;
    console.warn(`[projects] invoice reader "${reader.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
    throw readError(502, "reader_failed", controller.signal.aborted ? "Reading the invoice took too long" : "The model couldn't read the invoice");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
