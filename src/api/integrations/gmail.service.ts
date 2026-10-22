import { Readable } from "node:stream";
import type { SessionUser } from "@/features/auth/types/auth";
import { expenseCategorySchema } from "@/features/expenses/types/expenses";
import {
  GOOGLE_FEATURE_SCOPES,
  type MailBillRule,
  type MailBillRuleInput,
  type MailBillSuggestion,
  type MailBillSuggestionMail,
} from "@/features/integrations/types/google";
import {
  buildExpensePatch,
  buildRecurringPatch,
  matchWindow,
  pickOccurrence,
  rankMatches,
  referenceDate,
  type MailDocumentOrigin,
  type MailForMatching,
  type MailLinkInput,
  type MailLinkOptions,
  type MailLinkResult,
  type MailLinkTarget,
  type MailOccurrenceOptions,
  type MailUpdateField,
  type MailValues,
} from "@/features/integrations/types/mail-matching";
import { addDays, daysBetween } from "@/types/dates";
import { createFile, maxUploadBytes, storeFileContent } from "../documents/documents.service";
import {
  EXPENSE_DOCUMENT_TYPE,
  ensureRecurringInstance,
  getPaymentTarget,
  getRecurringExpense,
  listPaymentTargets,
  listRecurringExpenses,
  listRecurringOccurrences,
  patchExpenseDetails,
  patchRecurringPaymentDetails,
  type PaymentTarget,
} from "../expenses/expenses.service";
import { db } from "../lib/db";
import { HttpError, badRequest, conflict, notFound } from "../lib/http";
import { dateInZone } from "./google-calendar-mapping";
import { errorText, withGoogle, type ConnectionForAccess } from "./google-access";
import { googleJson } from "./google-http";
import { readWithReaders } from "./bill-readers";
import { dedupeKey, extractBill, gmailQuery, matchRule, senderAddress } from "./gmail-extract";
import { DEFAULT_MAIL_BILL_RULES } from "./gmail-rules";
import { notifyMailBills } from "./mail-notifications";
import { extractPdfText } from "./pdf-text";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** The first search looks back this far; later ones start a day before the previous search. */
const FIRST_SCAN_DAYS = 60;
const MAX_MESSAGES_PER_SCAN = 100;
/** PDFs larger than this are not read during the scan (the body still is); they are still attached on Accept. */
const MAX_SCAN_PDF_BYTES = 5_000_000;

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────────

/** Seeds the built-in senders once per household (missing keys only; edited or disabled ones stay as they are). */
export async function ensureDefaultRules(householdId: string): Promise<void> {
  await db.mailBillRule.createMany({
    data: DEFAULT_MAIL_BILL_RULES.map((rule) => ({ householdId, builtInKey: rule.key, payee: rule.payee, senders: rule.senders, category: rule.category })),
    skipDuplicates: true,
  });
}

type RuleRow = { id: string; payee: string; senders: string[]; category: string; enabled: boolean; builtInKey: string | null; recurringExpenseId: string | null };
const toRule = (row: RuleRow): MailBillRule => ({
  id: row.id,
  payee: row.payee,
  senders: row.senders,
  category: row.category,
  enabled: row.enabled,
  builtIn: row.builtInKey !== null,
  recurringExpenseId: row.recurringExpenseId,
});

export async function listRules(householdId: string): Promise<MailBillRule[]> {
  await ensureDefaultRules(householdId);
  const rows = await db.mailBillRule.findMany({ where: { householdId }, orderBy: { payee: "asc" } });
  return rows.map(toRule);
}

function checkCategory(input: MailBillRuleInput) {
  if (!expenseCategorySchema.safeParse(input.category).success) throw badRequest("Unknown category", { category: ["Unknown category"] });
}

export async function createRule(householdId: string, input: MailBillRuleInput): Promise<MailBillRule> {
  checkCategory(input);
  return toRule(await db.mailBillRule.create({ data: { householdId, ...input, senders: [...new Set(input.senders)] } }));
}

export async function updateRule(householdId: string, id: string, input: MailBillRuleInput): Promise<MailBillRule> {
  checkCategory(input);
  const { count } = await db.mailBillRule.updateMany({ where: { id, householdId }, data: { ...input, senders: [...new Set(input.senders)] } });
  if (count === 0) throw notFound("Rule not found");
  return toRule(await db.mailBillRule.findUniqueOrThrow({ where: { id } }));
}

/** Built-in rules can't be deleted (they would come back): switch them off instead. */
export async function deleteRule(householdId: string, id: string): Promise<void> {
  const rule = await db.mailBillRule.findFirst({ where: { id, householdId } });
  if (!rule) throw notFound("Rule not found");
  if (rule.builtInKey) throw badRequest("Built-in senders can be switched off, not removed");
  await db.mailBillRule.delete({ where: { id } });
}

// ── Reading messages ─────────────────────────────────────────────────────────────────────────────────

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
type GmailMessage = { id: string; internalDate?: string; payload?: GmailPart };

const header = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function walk(part: GmailPart | undefined, visit: (part: GmailPart) => void) {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

/** Plain text of the mail body (text/plain, else text/html without tags), capped. */
export function bodyText(message: GmailMessage): string {
  let plain = "";
  let html = "";
  walk(message.payload, (part) => {
    if (!part.body?.data || part.filename) return;
    if (part.mimeType === "text/plain") plain += `${decode(part.body.data)}\n`;
    else if (part.mimeType === "text/html") html += `${decode(part.body.data)}\n`;
  });
  const text =
    plain ||
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&euro;/g, "€")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  return text.replace(/[ \t]+/g, " ").slice(0, 20_000);
}

/** The first PDF attachment of a message. */
export function pdfPart(message: GmailMessage): GmailPart | null {
  let found: GmailPart | null = null;
  walk(message.payload, (part) => {
    if (found || !part.body?.attachmentId) return;
    if (part.mimeType === "application/pdf" || part.filename?.toLowerCase().endsWith(".pdf")) found = part;
  });
  return found;
}

const getMessage = (connection: ConnectionForAccess, id: string, signal?: AbortSignal) =>
  withGoogle(connection, (accessToken) => googleJson<GmailMessage>(`${API}/messages/${encodeURIComponent(id)}?format=full`, { accessToken, signal }));

async function downloadAttachment(connection: ConnectionForAccess, messageId: string, attachmentId: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  const body = await withGoogle(connection, (accessToken) =>
    googleJson<{ data?: string; size?: number }>(`${API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      accessToken,
      signal,
      // base64 is a third larger than the file.
      maxBytes: Math.ceil(maxBytes * 1.4) + 10_000,
    }),
  );
  const bytes = Buffer.from(body.data ?? "", "base64url");
  if (bytes.length > maxBytes) throw new Error("Attachment too large");
  return bytes;
}

// ── Scanning ─────────────────────────────────────────────────────────────────────────────────────────

type ScanConnection = ConnectionForAccess & { householdId: string; gmailLastScanAt: Date | null };

/** Searches one mailbox for bills from the household's senders and creates suggestions. Returns how many were added. */
export async function scanMailbox(connection: ScanConnection, { signal, log }: { signal?: AbortSignal; log?: (line: string) => void } = {}): Promise<number> {
  await ensureDefaultRules(connection.householdId);
  const rules = await db.mailBillRule.findMany({ where: { householdId: connection.householdId, enabled: true } });
  const startedAt = new Date();
  if (rules.length === 0) {
    await db.googleConnection.update({ where: { id: connection.id }, data: { gmailLastScanAt: startedAt, gmailError: null } });
    return 0;
  }
  const after = connection.gmailLastScanAt
    ? connection.gmailLastScanAt.getTime() - 24 * 3600 * 1000
    : startedAt.getTime() - FIRST_SCAN_DAYS * 24 * 3600 * 1000;
  const q = gmailQuery(rules.flatMap((rule) => rule.senders), after / 1000);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API}/messages`);
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await withGoogle(connection, (accessToken) =>
      googleJson<{ messages?: { id: string }[]; nextPageToken?: string }>(url, { accessToken, signal }),
    );
    ids.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES_PER_SCAN);

  const known = new Set(
    (await db.mailBillSuggestion.findMany({ where: { connectionId: connection.id, gmailMessageId: { in: ids } }, select: { gmailMessageId: true } })).map(
      (row) => row.gmailMessageId,
    ),
  );
  let added = 0;
  const found: { payee: string; amountCents: number | null }[] = [];
  for (const id of ids.slice(0, MAX_MESSAGES_PER_SCAN)) {
    if (known.has(id)) continue;
    signal?.throwIfAborted();
    const message = await getMessage(connection, id, signal);
    const address = senderAddress(header(message, "From"));
    const rule = address ? matchRule(address, rules) : null;
    const pdf = pdfPart(message);
    if (!rule || !pdf) continue;

    const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
    const subject = header(message, "Subject").slice(0, 200);
    let pdfText = "";
    if (pdf.body?.attachmentId && (pdf.body.size ?? 0) <= MAX_SCAN_PDF_BYTES) {
      try {
        pdfText = await extractPdfText(await downloadAttachment(connection, id, pdf.body.attachmentId, MAX_SCAN_PDF_BYTES, signal));
      } catch (error) {
        log?.(`${rule.payee}: PDF not read (${errorText(error)})`);
      }
    }
    // The PDF is the invoice: what it says wins over the mail's text ("€ 0 if you already paid") and subject.
    // With the household's language model connected, it reads them too (only values the texts confirm count).
    const mailText = bodyText(message);
    const receivedOn = dateInZone(receivedAt);
    const bill = await readWithReaders(
      { payee: rule.payee, subject, mailText, pdfText, receivedOn },
      extractBill([pdfText, mailText, subject], receivedOn),
      signal,
    );
    const key = dedupeKey({ payee: rule.payee, ...bill, messageId: id });
    const duplicate =
      (await db.mailBillSuggestion.findFirst({ where: { householdId: connection.householdId, dedupeKey: key }, select: { id: true } })) ||
      (bill.structuredCommunication &&
        (await db.expense.findFirst({ where: { householdId: connection.householdId, structuredCommunication: bill.structuredCommunication }, select: { id: true } })));
    if (duplicate) continue;

    await db.mailBillSuggestion.create({
      data: {
        householdId: connection.householdId,
        connectionId: connection.id,
        ruleId: rule.id,
        gmailMessageId: id,
        attachmentPartId: pdf.partId ?? null,
        attachmentName: (pdf.filename || `${rule.payee}.pdf`).slice(0, 200),
        payee: rule.payee,
        category: rule.category,
        subject,
        receivedAt,
        amountCents: bill.amountCents,
        dueDate: bill.dueDate ? new Date(`${bill.dueDate}T00:00:00Z`) : null,
        structuredCommunication: bill.structuredCommunication,
        iban: bill.iban,
        dedupeKey: key,
      },
    });
    added++;
    found.push({ payee: rule.payee, amountCents: bill.amountCents });
  }
  await db.googleConnection.update({ where: { id: connection.id }, data: { gmailLastScanAt: startedAt, gmailError: null } });
  log?.(`${added} new suggestion(s) from ${ids.length} mail(s)`);
  // "2 bills found in mail" to the owners and adults (docs/NOTIFICATIONS.md).
  await notifyMailBills(connection.householdId, found);
  return added;
}

const scanSelect = { id: true, userId: true, householdId: true, refreshTokenEnc: true, status: true, scopes: true, gmailLastScanAt: true, googleAccountEmail: true } as const;
const hasGmail = (connection: { scopes: string[] }) => GOOGLE_FEATURE_SCOPES.gmail.every((scope) => connection.scopes.includes(scope));

/** One mailbox now ("Search mail now"); the error is stored on the connection and rethrown. */
export async function scanConnection(connectionId: string, options: { signal?: AbortSignal; log?: (line: string) => void } = {}): Promise<number> {
  const connection = await db.googleConnection.findUnique({ where: { id: connectionId }, select: scanSelect });
  if (!connection || connection.status !== "CONNECTED" || !hasGmail(connection)) return 0;
  try {
    return await scanMailbox(connection, options);
  } catch (error) {
    await db.googleConnection.update({ where: { id: connectionId }, data: { gmailError: errorText(error) } });
    throw error;
  }
}

/** The job: every connected mailbox with Gmail turned on. */
export async function scanAllMailboxes({ signal, log }: { signal: AbortSignal; log: (line: string) => void }) {
  const connections = await db.googleConnection.findMany({ where: { status: "CONNECTED" }, select: scanSelect });
  let added = 0;
  let failed = 0;
  for (const connection of connections.filter(hasGmail)) {
    signal.throwIfAborted();
    try {
      added += await scanConnection(connection.id, { signal, log });
    } catch (error) {
      failed++;
      log?.(`a mailbox failed: ${errorText(error)}`);
    }
  }
  return { added, failed };
}

// ── Suggestions ──────────────────────────────────────────────────────────────────────────────────────

const suggestionInclude = { connection: { select: { googleAccountEmail: true, user: { select: { email: true, habitant: { select: { name: true } } } } } } } as const;

type SuggestionRow = {
  id: string;
  payee: string;
  category: string;
  subject: string;
  receivedAt: Date;
  amountCents: number | null;
  dueDate: Date | null;
  structuredCommunication: string | null;
  iban: string | null;
  attachmentName: string | null;
  status: "PENDING" | "ACCEPTED" | "DISMISSED" | "LINKED";
  connection: { googleAccountEmail: string; user: { email: string; habitant: { name: string } | null } };
  rule: { senders: string[]; recurringExpenseId: string | null } | null;
};

const toSuggestion = (row: SuggestionRow, matches: MailBillSuggestion["matches"] = []): MailBillSuggestion => ({
  id: row.id,
  payee: row.payee,
  category: row.category,
  subject: row.subject,
  receivedAt: row.receivedAt.toISOString(),
  amountCents: row.amountCents,
  dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
  structuredCommunication: row.structuredCommunication,
  iban: row.iban,
  attachmentName: row.attachmentName,
  mailboxOwner: row.connection.user.habitant?.name ?? row.connection.user.email,
  status: row.status.toLowerCase() as MailBillSuggestion["status"],
  matches,
  rememberedRecurringId: row.rule?.recurringExpenseId ?? null,
});

// ── Matching mails to existing expenses ──────────────────────────────────────────────────────────────

/** Remembered recurring expenses: their occurrences this far around the mail are considered. */
const REMEMBERED_SPAN_DAYS = 200;

const mailOf = (row: Omit<SuggestionRow, "connection" | "status" | "id" | "category" | "subject" | "attachmentName">): MailForMatching => ({
  payee: row.payee,
  senders: row.rule?.senders ?? [],
  rememberedRecurringId: row.rule?.recurringExpenseId ?? null,
  amountCents: row.amountCents,
  dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
  receivedOn: dateInZone(row.receivedAt),
  structuredCommunication: row.structuredCommunication,
  iban: row.iban,
});

const valuesOf = (mail: MailForMatching): MailValues => ({
  payee: mail.payee,
  amountCents: mail.amountCents,
  dueDate: mail.dueDate,
  structuredCommunication: mail.structuredCommunication,
  iban: mail.iban,
});

const asTarget = (target: PaymentTarget): MailLinkTarget => target;

/**
 * Ranked matches for several mails with as few queries as possible: unpaid expenses and virtual occurrences
 * in the union of their windows, plus for a remembered recurring expense the occurrence nearest to each mail
 * (whatever its distance), so a remembered sender always comes pre-matched.
 */
async function matchMails(householdId: string, mails: MailForMatching[]): Promise<MailLinkTarget[][]> {
  if (mails.length === 0) return [];
  const windows = mails.map(matchWindow);
  const from = windows.reduce((min, window) => (window.from < min ? window.from : min), windows[0]?.from ?? "");
  const to = windows.reduce((max, window) => (window.to > max ? window.to : max), windows[0]?.to ?? "");
  const targets = (await listPaymentTargets(householdId, from, to, { includeVirtual: true })).map(asTarget);

  const remembered = new Map<string, MailLinkTarget[]>();
  for (const id of new Set(mails.map((mail) => mail.rememberedRecurringId).filter((value): value is string => Boolean(value)))) {
    const references = mails.filter((mail) => mail.rememberedRecurringId === id).map(referenceDate).sort();
    try {
      const occurrences = await listRecurringOccurrences(
        householdId,
        id,
        addDays(references[0] ?? from, -REMEMBERED_SPAN_DAYS),
        addDays(references[references.length - 1] ?? to, REMEMBERED_SPAN_DAYS),
      );
      remembered.set(id, occurrences.map(asTarget));
    } catch {
      // The remembered recurring expense was deleted: nothing pre-matched.
    }
  }
  return mails.map((mail) => {
    const own = mail.rememberedRecurringId ? (remembered.get(mail.rememberedRecurringId) ?? []) : [];
    const nearest = pickOccurrence(
      own.filter((target) => !target.paidOn).map((target) => target.dueDate),
      mail,
    );
    return [...targets, ...own.filter((target) => target.dueDate === nearest)];
  });
}

/** The household's pending suggestions, newest first, each with its ranked matches. */
/**
 * Mails accepted or linked to an expense that was deleted since come back as suggestions (the scan never finds
 * a mail it already knows again). There's no foreign key to expenses, so this compares ids.
 */
async function reopenOrphanedSuggestions(householdId: string): Promise<void> {
  const decided = await db.mailBillSuggestion.findMany({
    where: { householdId, status: { in: ["ACCEPTED", "LINKED"] }, expenseId: { not: null } },
    select: { id: true, expenseId: true },
  });
  if (!decided.length) return;
  const existing = new Set(
    (await db.expense.findMany({ where: { householdId, id: { in: decided.map((row) => row.expenseId as string) } }, select: { id: true } })).map((row) => row.id),
  );
  const orphaned = decided.filter((row) => !existing.has(row.expenseId as string)).map((row) => row.id);
  if (!orphaned.length) return;
  await db.mailBillSuggestion.updateMany({
    where: { id: { in: orphaned } },
    data: { status: "PENDING", expenseId: null, documentFileId: null, decidedAt: null },
  });
}

export async function listPendingSuggestions(householdId: string): Promise<MailBillSuggestion[]> {
  await reopenOrphanedSuggestions(householdId);
  const rows = await db.mailBillSuggestion.findMany({
    where: { householdId, status: "PENDING" },
    include: { ...suggestionInclude, rule: { select: { senders: true, recurringExpenseId: true } } },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });
  const mails = rows.map(mailOf);
  let candidates: MailLinkTarget[][] = [];
  try {
    candidates = await matchMails(householdId, mails);
  } catch (error) {
    // Matching is a help: the suggestions still show (Accept / Dismiss) without it.
    console.warn(`[google] matching mail bills failed: ${errorText(error)}`);
  }
  return rows.map((row, index) => toSuggestion(row, rankMatches(mails[index] as MailForMatching, candidates[index] ?? [])));
}

const linkableRow = (householdId: string, id: string) =>
  db.mailBillSuggestion.findFirst({
    where: { id, householdId },
    include: { ...suggestionInclude, connection: { select: { ...scanSelect, user: suggestionInclude.connection.select.user } }, rule: { select: { senders: true, recurringExpenseId: true } } },
  });

async function findPendingForLink(householdId: string, id: string) {
  const row = await linkableRow(householdId, id);
  if (!row || row.status !== "PENDING") throw notFound("Suggestion not found");
  return row;
}

/** How many expenses the "Expenses" tab of the link dialog offers (nearest to the mail first). */
const LINKABLE_EXPENSES = 300;

/** What the link dialog offers for one pending suggestion: ranked matches, expenses to search, recurring expenses. */
export async function getLinkOptions(householdId: string, id: string): Promise<MailLinkOptions> {
  const row = await findPendingForLink(householdId, id);
  const mail = mailOf(row);
  const reference = referenceDate(mail);
  const [[candidates = []], expenses, recurring] = await Promise.all([
    matchMails(householdId, [mail]),
    listPaymentTargets(householdId, addDays(reference, -365), addDays(reference, 120), { includePaid: true }),
    listRecurringExpenses(householdId),
  ]);
  const distance = (target: MailLinkTarget) => Math.abs(daysBetween(reference, target.dueDate));
  const statusOrder = { active: 0, paused: 1, ended: 2 } as const;
  return {
    matches: rankMatches(mail, candidates),
    expenses: expenses
      .map(asTarget)
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, LINKABLE_EXPENSES),
    recurring: recurring
      .map((item) => ({
        id: item.id,
        payee: item.payee,
        category: item.category,
        kind: item.kind,
        status: item.status,
        amountCents: item.amountCents,
        rrule: item.rrule,
        nextDueDate: item.nextDueDate,
        structuredCommunication: item.structuredCommunication,
        iban: item.iban,
        beneficiaryName: item.beneficiaryName,
      }))
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.payee.localeCompare(b.payee)),
    rememberedRecurringId: mail.rememberedRecurringId,
  };
}

/** How many occurrences the occurrence choice shows around the mail's due date. */
const OCCURRENCE_CHOICES = 7;

/** The occurrences of one recurring expense around the mail, and the one the app picks for it. */
export async function getOccurrenceOptions(householdId: string, id: string, recurringExpenseId: string): Promise<MailOccurrenceOptions> {
  const row = await findPendingForLink(householdId, id);
  const mail = mailOf(row);
  const reference = referenceDate(mail);
  const all = (await listRecurringOccurrences(householdId, recurringExpenseId, addDays(reference, -REMEMBERED_SPAN_DAYS), addDays(reference, REMEMBERED_SPAN_DAYS))).map(asTarget);
  const suggested = pickOccurrence(
    all.map((target) => target.dueDate),
    mail,
  );
  const nearest = [...all]
    .sort((a, b) => Math.abs(daysBetween(reference, a.dueDate)) - Math.abs(daysBetween(reference, b.dueDate)))
    .slice(0, OCCURRENCE_CHOICES)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { occurrences: nearest, suggested };
}

const FIELD_OF_PATCH = { amountCents: "amount", dueDate: "dueDate", structuredCommunication: "structuredCommunication", iban: "iban", beneficiaryName: "beneficiaryName" } as const;

/**
 * Links a pending suggestion to an expense that exists, or to a recurring expense's occurrence (created when
 * needed, through the expenses service). Applies the chosen fields from the mail to that expense (never the
 * amount or due date of a paid one without `allowPaidChanges`), optionally the template's payment details,
 * remembers the sender's recurring expense when asked, attaches the PDF and marks the suggestion LINKED.
 * Repeating the same request answers `alreadyLinked` without doing anything twice.
 */
export async function linkSuggestion(user: SessionUser, id: string, input: MailLinkInput): Promise<MailLinkResult> {
  const householdId = user.householdId;
  const row = await linkableRow(householdId, id);
  if (!row) throw notFound("Suggestion not found");
  const repeated = async (expenseId: string | null): Promise<MailLinkResult | null> => {
    if (!expenseId) return null;
    const linked = await getPaymentTarget(householdId, expenseId).catch(() => null);
    const same =
      "expenseId" in input.target ? input.target.expenseId === expenseId : linked !== null && linked.recurringExpenseId === input.target.recurringExpenseId;
    return same ? { expenseId, created: false, attached: false, updated: [], alreadyLinked: true } : null;
  };
  if (row.status !== "PENDING") {
    const again = row.status === "LINKED" ? await repeated(row.expenseId) : null;
    if (again) return { ...again, attached: row.documentFileId !== null };
    throw conflict("This mail was already handled");
  }

  const mail = valuesOf(mailOf(row));
  let expenseId: string;
  let created = false;
  if ("expenseId" in input.target) {
    expenseId = (await getPaymentTarget(householdId, input.target.expenseId)).expenseId as string;
  } else {
    const result = await ensureRecurringInstance(householdId, input.target.recurringExpenseId, input.target.dueDate);
    expenseId = result.expense.id;
    created = result.created;
  }
  const current = await getPaymentTarget(householdId, expenseId);
  const { patch, blocked } = buildExpensePatch(current, mail, input.apply, { allowPaidChanges: input.allowPaidChanges });
  if (blocked.length > 0) throw badRequest("This expense is already paid", { apply: blocked.map((field) => `${field}: already paid`) });

  // Claim the suggestion first, so a double tap can't link (and attach the PDF) twice.
  const claim = await db.mailBillSuggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "LINKED", expenseId, decidedAt: new Date() } });
  if (claim.count === 0) {
    const latest = await db.mailBillSuggestion.findUnique({ where: { id }, select: { status: true, expenseId: true, documentFileId: true } });
    const again = latest?.status === "LINKED" ? await repeated(latest.expenseId) : null;
    if (again) return { ...again, attached: latest?.documentFileId !== null };
    throw conflict("This mail was already handled");
  }

  const updated: MailUpdateField[] = [];
  try {
    if (Object.keys(patch).length > 0) {
      await patchExpenseDetails(householdId, expenseId, patch, { allowPaidChanges: input.allowPaidChanges });
      updated.push(...Object.keys(patch).map((key) => FIELD_OF_PATCH[key as keyof typeof FIELD_OF_PATCH]));
    }
    if (input.updateRecurring.length > 0 && current.recurringExpenseId) {
      const template = await getRecurringExpense(householdId, current.recurringExpenseId);
      const templatePatch = buildRecurringPatch(template, mail, input.updateRecurring);
      if (Object.keys(templatePatch).length > 0) {
        await patchRecurringPaymentDetails(householdId, current.recurringExpenseId, templatePatch, { exceptExpenseId: expenseId });
      }
    }
  } catch (error) {
    await db.mailBillSuggestion.update({ where: { id }, data: { status: "PENDING", expenseId: null, decidedAt: null } });
    throw error;
  }

  if (input.remember !== undefined && row.ruleId) {
    if (input.remember && current.recurringExpenseId) {
      await db.mailBillRule.update({ where: { id: row.ruleId }, data: { recurringExpenseId: current.recurringExpenseId } });
    } else if (!input.remember && row.rule?.recurringExpenseId && row.rule.recurringExpenseId === current.recurringExpenseId) {
      await db.mailBillRule.update({ where: { id: row.ruleId }, data: { recurringExpenseId: null } });
    }
  }

  const documentFileId = await attachMailPdf(user, row, expenseId);
  if (documentFileId) await db.mailBillSuggestion.update({ where: { id }, data: { documentFileId } });
  return { expenseId, created, attached: documentFileId !== null, updated, alreadyLinked: false };
}

/** Which documents of an expense came from a mail (accepted or linked suggestions), with when the mail arrived. */
export async function listMailOrigins(householdId: string, expenseId: string): Promise<MailDocumentOrigin[]> {
  const rows = await db.mailBillSuggestion.findMany({
    where: { householdId, expenseId, status: { in: ["ACCEPTED", "LINKED"] }, documentFileId: { not: null } },
    select: { documentFileId: true, receivedAt: true, payee: true },
    orderBy: { receivedAt: "asc" },
  });
  return rows.flatMap((row) => (row.documentFileId ? [{ documentFileId: row.documentFileId, receivedAt: row.receivedAt.toISOString(), payee: row.payee }] : []));
}

async function findPending(householdId: string, id: string) {
  const row = await db.mailBillSuggestion.findFirst({ where: { id, householdId, status: "PENDING" }, include: { connection: { select: scanSelect } } });
  if (!row) throw notFound("Suggestion not found");
  return row;
}

export async function dismissSuggestion(householdId: string, id: string): Promise<void> {
  await findPending(householdId, id);
  await db.mailBillSuggestion.update({ where: { id }, data: { status: "DISMISSED", decidedAt: new Date() } });
}

/**
 * The text of a pending suggestion's mail, read from the mailbox again, so the person can check what was found
 * before accepting: the body as plain text (never its HTML), and whether it still has a PDF.
 */
export async function getSuggestionMail(householdId: string, id: string): Promise<MailBillSuggestionMail> {
  const row = await findPending(householdId, id);
  try {
    const message = await getMessage(row.connection, row.gmailMessageId);
    return { text: bodyText(message).replace(/\n{3,}/g, "\n\n").trim(), hasPdf: pdfPart(message) !== null };
  } catch (error) {
    throw new HttpError(502, "mail_unavailable", `The mail couldn't be read from the mailbox: ${errorText(error)}`);
  }
}

/** The PDF of a pending suggestion, from the mailbox (for the preview); 404 when the mail has none any more. */
export async function getSuggestionPdf(householdId: string, id: string): Promise<{ bytes: Buffer; name: string }> {
  const row = await findPending(householdId, id);
  let bytes: Buffer | null;
  try {
    bytes = await fetchMailPdf(row);
  } catch (error) {
    throw new HttpError(502, "mail_unavailable", `The PDF couldn't be read from the mailbox: ${errorText(error)}`);
  }
  if (!bytes) throw notFound("This mail has no PDF");
  const name = row.attachmentName ?? `${row.payee}.pdf`;
  return { bytes, name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf` };
}

/**
 * After the person saved the (prefilled) expense: fetch the PDF from the mailbox again, store it in Documents
 * attached to the expense, and mark the suggestion accepted. A PDF that can't be fetched doesn't undo anything.
 */
export async function acceptSuggestion(user: SessionUser, id: string, expenseId: string): Promise<{ attached: boolean }> {
  const row = await findPending(user.householdId, id);
  const expense = await db.expense.findFirst({ where: { id: expenseId, householdId: user.householdId }, select: { id: true } });
  if (!expense) throw notFound("Expense not found");
  const documentFileId = await attachMailPdf(user, row, expense.id);
  await db.mailBillSuggestion.update({
    where: { id },
    data: { status: "ACCEPTED", expenseId: expense.id, documentFileId, decidedAt: new Date() },
  });
  return { attached: documentFileId !== null };
}

type MailForPdf = {
  connection: ConnectionForAccess;
  gmailMessageId: string;
  attachmentPartId: string | null;
  attachmentName: string | null;
  payee: string;
};

/**
 * Fetches the mail's PDF from the mailbox again and stores it in Documents, attached to the expense. Returns
 * the document's id, or `null` when it couldn't be fetched (that never undoes the accept or link).
 */
/** The mail's PDF, fetched from the mailbox again (the part found at scan time, else the first PDF), or null. */
async function fetchMailPdf(row: MailForPdf, message?: GmailMessage): Promise<Buffer | null> {
  message ??= await getMessage(row.connection, row.gmailMessageId);
  let part: GmailPart | null = null;
  walk(message.payload, (candidate) => {
    if (!part && candidate.partId === row.attachmentPartId && candidate.body?.attachmentId) part = candidate;
  });
  part ??= pdfPart(message);
  const attachmentId = (part as GmailPart | null)?.body?.attachmentId;
  return attachmentId ? downloadAttachment(row.connection, row.gmailMessageId, attachmentId, maxUploadBytes()) : null;
}

async function attachMailPdf(user: SessionUser, row: MailForPdf, expenseId: string): Promise<string | null> {
  let documentFileId: string | null = null;
  try {
    const bytes = await fetchMailPdf(row);
    if (bytes) {
      // eslint-disable-next-line no-control-regex
      const name = (row.attachmentName ?? `${row.payee}.pdf`).replace(/[/\\\u0000-\u001f\u007f]/g, "_");
      const file = await createFile(user, {
        name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        link: { entityType: EXPENSE_DOCUMENT_TYPE, entityId: expenseId },
      });
      await storeFileContent(user.householdId, file.id, Readable.from(bytes), { contentType: "application/pdf", contentLength: String(bytes.length) });
      documentFileId = file.id;
    }
  } catch (error) {
    console.warn(`[google] attaching a mail PDF failed: ${errorText(error)}`);
  }
  return documentFileId;
}
