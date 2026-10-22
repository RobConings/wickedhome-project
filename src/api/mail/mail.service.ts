import { Readable } from "node:stream";
import type { SessionUser } from "@/features/auth/types/auth";
import { mimeTypeSchema, normalizeMimeType } from "@/features/documents/types/documents";
import { featuresFromScopes } from "@/features/integrations/types/google";
import type { MailThreadInfo, ProjectMailThreads } from "@/features/integrations/types/mail";
import { attachFile, createFile, maxUploadBytes, openFileContent, storeFileContent } from "../documents/documents.service";
import { EXPENSE_DOCUMENT_TYPE } from "../expenses/expenses.service";
import { GoogleUnavailableError, googleClientConfig, withGoogle } from "../integrations/google-access";
import { GoogleApiError } from "../integrations/google-http";
import { db } from "../lib/db";
import { HttpError, badRequest, forbidden, notFound } from "../lib/http";
import {
  getAttachmentBytes,
  getFullMessage,
  getMessageMetadata,
  getThread,
  gmailThreadUrl,
  saveRawDraft,
  searchMessageIds,
  sendRawMessage,
  type GmailSession,
} from "./mail-gmail";
import { buildMimeMessage, isEmail, oneLine, type MailAddress, type MailFile, type OutgoingMail } from "./mail-mime";
import { addressOf, displayNameOf, headerOf, readMessage, replySubject, walkParts, type GmailMessage, type GmailPart, type ReadMessage } from "./mail-text";

/*
 * Mail on the person's own Gmail (docs/INTEGRATIONS.md, ai/skills/mail): search, read, save attachments to
 * Documents, drafts and sending, and linking threads to projects. Every function works on the signed-in
 * person's own Google connection; nobody ever reads someone else's mailbox. Reading needs the `gmail`
 * feature (gmail.readonly), drafts and sending `gmail_send` (gmail.send + gmail.compose). Children: never.
 *
 * Mail is never stored: links keep a thread id, a subject and who wrote last (for reply notifications).
 */

// ── The person's mailbox ─────────────────────────────────────────────────────────────────────────────

export type MailNeed = "read" | "send";

/** Codes the assistant and the UI can tell apart. */
export const MAIL_ERRORS = {
  notConnected: "gmail_not_connected",
  readOff: "gmail_read_off",
  sendOff: "gmail_send_off",
} as const;

const SEND_HINT =
  'Sending mail is not switched on: on the Integrations page, under Google › Gmail, turn on "Send mail from the assistant" (Google asks once to allow it). Until then nothing can be sent or saved as a draft.';
const READ_HINT = "Gmail is not switched on for you: turn on Gmail under Google on the Integrations page first.";

export type MailboxAccess = GmailSession & { connectionId: string; canSend: boolean; canRead: boolean };

/**
 * Whether a connection allows what is needed; throws the 409 that says exactly what to switch on. Pure (the
 * scope gating, unit-tested).
 */
export function checkMailAccess(connection: { status: string; scopes: string[] } | null, need: MailNeed): { canRead: boolean; canSend: boolean } {
  if (!connection) throw new HttpError(409, MAIL_ERRORS.notConnected, "Your Google account is not connected: connect it with Gmail on the Integrations page first.");
  if (connection.status !== "CONNECTED") throw new HttpError(409, MAIL_ERRORS.notConnected, "Google needs to be reconnected on the Integrations page.");
  const features = featuresFromScopes(connection.scopes);
  const canRead = features.includes("gmail");
  const canSend = features.includes("gmail_send");
  if (need === "read" && !canRead) throw new HttpError(409, MAIL_ERRORS.readOff, READ_HINT);
  if (need === "send" && !canSend) throw new HttpError(409, MAIL_ERRORS.sendOff, SEND_HINT);
  return { canRead, canSend };
}

type MailboxOpener = (user: SessionUser, need: MailNeed, signal?: AbortSignal) => Promise<MailboxAccess>;
let mailboxOpener: MailboxOpener | null = null;

/** Tests: open a fake mailbox (a session against a fake Gmail) instead of the person's Google connection. */
export function setMailboxOpener(next: MailboxOpener | null): void {
  mailboxOpener = next;
}

/** The person's own mailbox, or a 409 that says exactly what to switch on. */
export async function openMailbox(user: SessionUser, need: MailNeed, signal?: AbortSignal): Promise<MailboxAccess> {
  if (user.role === "child") throw forbidden("Mail is not available for children");
  if (mailboxOpener) return mailboxOpener(user, need, signal);
  if (!googleClientConfig()) throw new HttpError(409, MAIL_ERRORS.notConnected, "Google is not set up on this server");
  const connection = await db.googleConnection.findUnique({ where: { userId: user.id } });
  const { canRead, canSend } = checkMailAccess(connection, need);
  if (!connection) throw new HttpError(409, MAIL_ERRORS.notConnected, "Google is not connected");
  return {
    connectionId: connection.id,
    email: connection.googleAccountEmail.toLowerCase(),
    signal,
    canRead,
    canSend,
    call: (work) => withGoogle(connection, work),
  };
}

/** Whether the person could send (for the card), without throwing. */
export async function mailCapabilities(user: SessionUser): Promise<{ canRead: boolean; canSend: boolean; email: string | null }> {
  if (user.role === "child") return { canRead: false, canSend: false, email: null };
  const connection = await db.googleConnection.findUnique({ where: { userId: user.id }, select: { scopes: true, status: true, googleAccountEmail: true } });
  if (!connection || connection.status !== "CONNECTED") return { canRead: false, canSend: false, email: null };
  const features = featuresFromScopes(connection.scopes);
  return { canRead: features.includes("gmail"), canSend: features.includes("gmail_send"), email: connection.googleAccountEmail };
}

/** Google's errors as messages the person (and the model) can act on; never mail content. */
export async function gmailCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof GoogleUnavailableError) throw new HttpError(409, MAIL_ERRORS.notConnected, "Google needs to be reconnected on the Integrations page.");
    if (error instanceof GoogleApiError) {
      if (error.status === 404 || (error.status === 400 && error.reason === "invalidArgument")) throw notFound("That mail was not found in your mailbox");
      if (error.status === 403 && /insufficient|permission|scope/i.test(error.reason ?? "")) throw new HttpError(409, MAIL_ERRORS.sendOff, SEND_HINT);
      if (error.reason === "too_large") throw new HttpError(413, "too_large", "That attachment is too large");
      throw new HttpError(502, "gmail_error", "Gmail is not reachable right now; try again later");
    }
    throw error;
  }
}

// ── Search ───────────────────────────────────────────────────────────────────────────────────────────

export type MailSearchInput = {
  /** Free text or Gmail search syntax ("offerte", "from:jan has:attachment"). */
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  /** YYYY-MM-DD, inclusive. */
  after?: string;
  /** YYYY-MM-DD, inclusive. */
  before?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  limit?: number;
};

const quoted = (value: string) => {
  const clean = oneLine(value).replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
  return /\s/.test(clean) ? `"${clean}"` : clean;
};
/** YYYY-MM-DD → Gmail's YYYY/MM/DD; `before` is exclusive in Gmail, so the day after. */
const gmailDay = (date: string, shiftDays = 0) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + shiftDays);
  return day.toISOString().slice(0, 10).replace(/-/g, "/");
};

/** The simple filters as one Gmail search. Without anything: the inbox. */
export function buildSearchQuery(input: MailSearchInput): string {
  const parts: string[] = [];
  if (input.query?.trim()) parts.push(oneLine(input.query).slice(0, 300));
  if (input.from?.trim()) parts.push(`from:${quoted(input.from)}`);
  if (input.to?.trim()) parts.push(`to:${quoted(input.to)}`);
  if (input.subject?.trim()) parts.push(`subject:(${oneLine(input.subject.replace(/[()]/g, " "))})`);
  if (input.after && /^\d{4}-\d{2}-\d{2}$/.test(input.after)) parts.push(`after:${gmailDay(input.after)}`);
  if (input.before && /^\d{4}-\d{2}-\d{2}$/.test(input.before)) parts.push(`before:${gmailDay(input.before, 1)}`);
  if (input.hasAttachment) parts.push("has:attachment");
  if (input.unread) parts.push("is:unread");
  return parts.length ? parts.join(" ") : "in:inbox";
}

export type MailListItem = {
  id: string;
  threadId: string;
  /** ISO instant. */
  date: string | null;
  from: string;
  fromEmail: string | null;
  to: string;
  subject: string;
  snippet: string;
  unread: boolean;
  sent: boolean;
};

const decodeSnippet = (text: string) =>
  text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function listItemOf(message: GmailMessage): MailListItem {
  const internal = Number(message.internalDate);
  const labels = new Set(message.labelIds ?? []);
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    date: Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : null,
    from: displayNameOf(headerOf(message.payload, "From")),
    fromEmail: addressOf(headerOf(message.payload, "From")),
    to: headerOf(message.payload, "To"),
    subject: headerOf(message.payload, "Subject"),
    snippet: decodeSnippet(message.snippet ?? "").slice(0, 200),
    unread: labels.has("UNREAD"),
    sent: labels.has("SENT"),
  };
}

/** The newest messages matching the search, at most `limit` (default 10, at most 25). */
export async function searchMail(session: GmailSession, input: MailSearchInput): Promise<MailListItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  return gmailCall(async () => {
    const ids = await searchMessageIds(session, buildSearchQuery(input), limit);
    const messages = await Promise.all(ids.map((entry) => getMessageMetadata(session, entry.id)));
    return messages.map(listItemOf);
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────────

/** The latest messages of a thread shown in full; older ones as one line each. */
export const THREAD_FULL_MESSAGES = 4;

export type ReadResult = {
  messages: ReadMessage[];
  /** Older messages of the thread, summarised. */
  earlier: { id: string; date: string | null; from: string; subject: string }[];
};

/** One message, or (`thread`) its whole thread: the latest few in full, drafts left out. */
export async function readMail(session: GmailSession, id: string, options: { thread?: boolean; textLimit?: number } = {}): Promise<ReadResult> {
  return gmailCall(async () => {
    const message = await getFullMessage(session, id);
    if (!options.thread) return { messages: [readMessage(message, options.textLimit)], earlier: [] };
    const thread = await getThread(session, message.threadId ?? message.id, "full");
    const all = (thread.messages ?? []).filter((entry) => !(entry.labelIds ?? []).includes("DRAFT"));
    const full = all.slice(-THREAD_FULL_MESSAGES);
    const earlier = all.slice(0, Math.max(0, all.length - THREAD_FULL_MESSAGES)).map((entry) => {
      const item = listItemOf(entry);
      return { id: item.id, date: item.date, from: item.from, subject: item.subject };
    });
    const limit = Math.floor((options.textLimit ?? 3600) / Math.max(1, full.length));
    return { messages: full.map((entry) => readMessage(entry, Math.max(600, limit))), earlier };
  });
}

// ── Attachments ──────────────────────────────────────────────────────────────────────────────────────

/** Picks an attachment by part id or (part of its) name; without one: the only attachment, else the first PDF. */
export function pickAttachment(message: GmailMessage, which?: string | null): GmailPart | null {
  const parts: GmailPart[] = [];
  walkParts(message.payload, (part) => {
    if (part.filename && part.body?.attachmentId && part.partId) parts.push(part);
  });
  const wanted = which?.trim().toLowerCase();
  if (wanted) {
    return (
      parts.find((part) => part.partId === wanted) ??
      parts.find((part) => part.filename?.toLowerCase() === wanted) ??
      parts.find((part) => part.filename?.toLowerCase().includes(wanted)) ??
      null
    );
  }
  if (parts.length === 1) return parts[0] ?? null;
  return parts.find((part) => part.mimeType === "application/pdf" || part.filename?.toLowerCase().endsWith(".pdf")) ?? parts[0] ?? null;
}

// eslint-disable-next-line no-control-regex
const safeFileName = (name: string) => name.replace(/[/\\\u0000-\u001f\u007f]/g, "_").trim().slice(0, 200) || "attachment";

/** An attachment's bytes, name and type. */
export async function fetchAttachment(session: GmailSession, messageId: string, which?: string | null, maxBytes = maxUploadBytes()): Promise<MailFile & { subject: string }> {
  return gmailCall(async () => {
    const message = await getFullMessage(session, messageId);
    const part = pickAttachment(message, which);
    if (!part?.body?.attachmentId) throw notFound(which ? `No attachment "${which}" in that mail` : "That mail has no attachments");
    if ((part.body.size ?? 0) > maxBytes) throw new HttpError(413, "too_large", "That attachment is too large to save");
    const content = await getAttachmentBytes(session, message.id, part.body.attachmentId, maxBytes);
    const mimeType = mimeTypeSchema.safeParse(normalizeMimeType(part.mimeType)).success ? normalizeMimeType(part.mimeType) : "application/octet-stream";
    return { name: safeFileName(part.filename ?? "attachment"), mimeType, content, subject: headerOf(message.payload, "Subject") };
  });
}

export type SaveAttachmentInput = {
  messageId: string;
  attachment?: string | null;
  folderId?: string | null;
  projectId?: string | null;
  expenseId?: string | null;
};

/** Stores a mail attachment in Documents (in a folder, attached to a project and/or expense). */
export async function saveAttachmentToDocuments(user: SessionUser, session: GmailSession, input: SaveAttachmentInput): Promise<{ fileId: string; name: string; sizeBytes: number }> {
  if (input.projectId) await assertProject(user.householdId, input.projectId);
  if (input.expenseId && !(await db.expense.findFirst({ where: { id: input.expenseId, householdId: user.householdId }, select: { id: true } }))) {
    throw notFound("Expense not found");
  }
  const file = await fetchAttachment(session, input.messageId, input.attachment);
  const links = [
    ...(input.projectId ? [{ entityType: "project" as const, entityId: input.projectId }] : []),
    ...(input.expenseId ? [{ entityType: EXPENSE_DOCUMENT_TYPE, entityId: input.expenseId }] : []),
  ];
  const created = await createFile(user, { name: file.name, folderId: input.folderId ?? null, mimeType: file.mimeType, sizeBytes: file.content.length, link: links[0] });
  await storeFileContent(user.householdId, created.id, Readable.from(file.content), { contentType: file.mimeType, contentLength: String(file.content.length) });
  for (const link of links.slice(1)) await attachFile(user.householdId, { fileId: created.id, ...link });
  return { fileId: created.id, name: file.name, sizeBytes: file.content.length };
}

// ── Composing ────────────────────────────────────────────────────────────────────────────────────────

/** Attachments of one mail together: Gmail takes 35 MB including base64. */
export const MAX_ATTACHMENT_BYTES = 20_000_000;

export type ComposeInput = {
  to: MailAddress[];
  cc?: MailAddress[];
  subject?: string | null;
  body: string;
  /** Gmail message id of the mail this answers: same thread, "Re:" subject, threading headers. */
  replyToMessageId?: string | null;
  /** Document ids to attach. */
  documentIds?: string[];
};

export type PreparedMail = {
  mail: OutgoingMail;
  threadId: string | null;
  /** The answered mail's subject, for the card. */
  replyToSubject: string | null;
  attachments: { name: string; sizeBytes: number }[];
};

/** The original of a reply: who to answer and the threading headers. */
async function replyContext(session: GmailSession, messageId: string) {
  const original = await gmailCall(() => getMessageMetadata(session, messageId));
  const from = headerOf(original.payload, "Reply-To") || headerOf(original.payload, "From");
  const email = addressOf(from);
  return {
    threadId: original.threadId ?? original.id,
    subject: headerOf(original.payload, "Subject"),
    messageIdHeader: headerOf(original.payload, "Message-ID") || headerOf(original.payload, "Message-Id") || null,
    references: headerOf(original.payload, "References") || null,
    // Answering your own sent mail goes to its recipients instead.
    sender: email && email !== session.email ? { email, name: displayNameOf(from) } : null,
    ownRecipients: email === session.email ? headerOf(original.payload, "To") : "",
  };
}

/** Parses "Jan <jan@x.be>, piet@y.be" into addresses (invalid ones dropped). */
export function parseAddressList(header: string): MailAddress[] {
  return header
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((entry) => ({ email: addressOf(entry) ?? "", name: displayNameOf(entry) }))
    .filter((entry) => isEmail(entry.email));
}

async function documentAttachments(householdId: string, ids: string[], loadBytes: boolean): Promise<(MailFile & { sizeBytes: number })[]> {
  const files: (MailFile & { sizeBytes: number })[] = [];
  let total = 0;
  for (const id of ids) {
    const { file, open } = await openFileContent(householdId, id);
    total += file.sizeBytes;
    if (total > MAX_ATTACHMENT_BYTES) throw badRequest("The attachments are too large together (at most 20 MB per mail)");
    let content = Buffer.alloc(0);
    if (loadBytes) {
      const chunks: Buffer[] = [];
      for await (const chunk of await open()) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      content = Buffer.concat(chunks);
    }
    files.push({ name: file.name, mimeType: file.mimeType || "application/octet-stream", content, sizeBytes: file.sizeBytes });
  }
  return files;
}

/**
 * The mail as it will go out: recipients (a reply without recipients answers the sender), subject ("Re: …"
 * for replies), threading headers and attachments. `loadAttachments: false` for the preview (sizes only).
 */
export async function prepareMail(householdId: string, session: GmailSession, input: ComposeInput, { loadAttachments = true } = {}): Promise<PreparedMail> {
  let to = input.to;
  let subject = oneLine(input.subject ?? "");
  let threadId: string | null = null;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  let replyToSubject: string | null = null;
  if (input.replyToMessageId) {
    const original = await replyContext(session, input.replyToMessageId);
    threadId = original.threadId;
    inReplyTo = original.messageIdHeader;
    references = original.references;
    replyToSubject = original.subject || null;
    if (!to.length) to = original.sender ? [original.sender] : parseAddressList(original.ownRecipients);
    subject = replySubject(subject || original.subject);
  }
  if (!to.length) throw badRequest("Who should the mail go to? Give a contact or an email address.");
  if (!subject) throw badRequest("The mail needs a subject");
  for (const address of [...to, ...(input.cc ?? [])]) if (!isEmail(address.email)) throw badRequest(`Not a valid email address: ${oneLine(address.email).slice(0, 80)}`);
  const files = await documentAttachments(householdId, input.documentIds ?? [], loadAttachments);
  return {
    mail: {
      from: { email: session.email },
      to,
      cc: input.cc ?? [],
      subject,
      body: input.body,
      inReplyTo,
      references,
      attachments: files.map(({ name, mimeType, content }) => ({ name, mimeType, content })),
    },
    threadId,
    replyToSubject,
    attachments: files.map((file) => ({ name: file.name, sizeBytes: file.sizeBytes })),
  };
}

export type DeliveredMail = { action: "send" | "draft"; messageId: string; threadId: string; draftId: string | null };

/** Sends the prepared mail, or saves it as a Gmail draft. */
export async function deliverMail(session: GmailSession, prepared: PreparedMail, action: "send" | "draft"): Promise<DeliveredMail> {
  const mime = buildMimeMessage(prepared.mail);
  return gmailCall(async () => {
    if (action === "send") {
      const sent = await sendRawMessage(session, mime, prepared.threadId);
      return { action, messageId: sent.messageId, threadId: sent.threadId, draftId: null };
    }
    const draft = await saveRawDraft(session, mime, prepared.threadId);
    return { action, messageId: draft.messageId, threadId: draft.threadId, draftId: draft.draftId };
  });
}

// ── Threads linked to projects ───────────────────────────────────────────────────────────────────────

async function assertProject(householdId: string, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, householdId }, select: { id: true, name: true } });
  if (!project) throw notFound("Project not found");
  return project;
}

export type ThreadLinkInput = {
  threadId: string;
  projectId?: string | null;
  contactId?: string | null;
  subject: string;
  counterpart?: MailAddress | null;
  /** When the newest known message was written; replies after it notify. */
  lastMessageAt?: Date | null;
  messageCount?: number;
  lastFromName?: string | null;
  lastFromMe?: boolean;
};

/** Links one of the person's threads to a project/contact (or updates the link). */
export async function linkThread(user: SessionUser, input: ThreadLinkInput): Promise<{ id: string }> {
  if (input.projectId) await assertProject(user.householdId, input.projectId);
  const values = {
    subject: oneLine(input.subject).slice(0, 200) || "(no subject)",
    ...(input.projectId !== undefined && { projectId: input.projectId }),
    ...(input.contactId !== undefined && { contactId: input.contactId }),
    ...(input.counterpart && { counterpartEmail: input.counterpart.email, counterpartName: input.counterpart.name ?? null }),
    ...(input.lastMessageAt !== undefined && { lastMessageAt: input.lastMessageAt }),
    ...(input.messageCount !== undefined && { messageCount: input.messageCount }),
    ...(input.lastFromName !== undefined && { lastFromName: input.lastFromName }),
    ...(input.lastFromMe !== undefined && { lastFromMe: input.lastFromMe }),
  };
  const row = await db.mailThreadLink.upsert({
    where: { userId_gmailThreadId: { userId: user.id, gmailThreadId: input.threadId } },
    create: { householdId: user.householdId, userId: user.id, gmailThreadId: input.threadId, ...values },
    update: values,
    select: { id: true },
  });
  return row;
}

/** What a thread looks like now (for a new link of an existing thread). */
export async function threadSnapshot(session: GmailSession, threadId: string) {
  const thread = await gmailCall(() => getThread(session, threadId, "metadata"));
  return { ...threadState(thread.messages ?? [], session.email), subject: headerOf(thread.messages?.[0]?.payload, "Subject") };
}

export type ThreadState = { count: number; lastAt: Date | null; lastFromName: string | null; lastFromEmail: string | null; lastFromMe: boolean };

const isDraft = (message: GmailMessage) => (message.labelIds ?? []).includes("DRAFT");
const fromMe = (message: GmailMessage, own: string) => (message.labelIds ?? []).includes("SENT") || addressOf(headerOf(message.payload, "From")) === own;
const sentAt = (message: GmailMessage) => {
  const value = Number(message.internalDate);
  return Number.isFinite(value) && value > 0 ? new Date(value) : null;
};

/** Count and newest message of a thread (drafts left out). Pure. */
export function threadState(messages: GmailMessage[], ownEmail: string): ThreadState {
  const real = messages.filter((message) => !isDraft(message));
  const last = real.reduce<GmailMessage | null>((newest, message) => (!newest || (sentAt(message)?.getTime() ?? 0) >= (sentAt(newest)?.getTime() ?? 0) ? message : newest), null);
  const lastFrom = last ? headerOf(last.payload, "From") : "";
  return {
    count: real.length,
    lastAt: last ? sentAt(last) : null,
    lastFromName: last ? displayNameOf(lastFrom) : null,
    lastFromEmail: last ? addressOf(lastFrom) : null,
    lastFromMe: last ? fromMe(last, ownEmail) : true,
  };
}

/** Messages from others newer than `since` (none when `since` is unknown: a new link starts quiet). Pure. */
export function newReplies(messages: GmailMessage[], ownEmail: string, since: Date | null): GmailMessage[] {
  if (!since) return [];
  return messages.filter((message) => !isDraft(message) && !fromMe(message, ownEmail) && (sentAt(message)?.getTime() ?? 0) > since.getTime());
}

/** Your own mails about a project, newest first (nothing when Gmail isn't on for you). */
export async function listProjectThreads(user: SessionUser, projectId: string): Promise<ProjectMailThreads> {
  const capabilities = await mailCapabilities(user);
  if (!capabilities.canRead || !capabilities.email) return { connected: false, threads: [] };
  const rows = await db.mailThreadLink.findMany({
    where: { userId: user.id, householdId: user.householdId, projectId },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
  });
  const email = capabilities.email;
  return {
    connected: true,
    threads: rows.map((row): MailThreadInfo => ({
      id: row.id,
      subject: row.subject,
      counterpart: row.counterpartName || row.counterpartEmail,
      messageCount: row.messageCount,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastFromName: row.lastFromName,
      lastFromMe: row.lastFromMe,
      gmailUrl: gmailThreadUrl(email, row.gmailThreadId),
    })),
  };
}

/** Removes one of your own links (the mail itself stays in Gmail). */
export async function unlinkThread(user: SessionUser, id: string): Promise<void> {
  const { count } = await db.mailThreadLink.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw notFound("Link not found");
}

/** After the person wrote in a linked thread (a reply without a project): keep its link current. */
export async function noteOwnMessage(user: SessionUser, threadId: string, at = new Date()): Promise<boolean> {
  const { count } = await db.mailThreadLink.updateMany({
    where: { userId: user.id, gmailThreadId: threadId },
    data: { lastMessageAt: at, lastFromMe: true, lastFromName: user.name },
  });
  return count > 0;
}

/** Name and size of the attachment `which` (as `pickAttachment` picks it) and the mail's subject, for the card. */
export async function attachmentInfo(session: GmailSession, messageId: string, which?: string | null): Promise<{ name: string; sizeBytes: number; subject: string }> {
  return gmailCall(async () => {
    const message = await getFullMessage(session, messageId);
    const part = pickAttachment(message, which);
    if (!part?.filename) throw notFound(which ? `No attachment "${which}" in that mail` : "That mail has no attachments");
    return { name: safeFileName(part.filename), sizeBytes: part.body?.size ?? 0, subject: headerOf(message.payload, "Subject") };
  });
}
