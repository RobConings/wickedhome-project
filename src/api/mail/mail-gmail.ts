import { randomBytes } from "node:crypto";
import { googleJson } from "../integrations/google-http";
import type { GmailMessage } from "./mail-text";

/*
 * Gmail's REST API for one mailbox: search, read, attachments, drafts and sending. Every call goes through a
 * `GmailSession`, which supplies the access token (in the app: the person's own Google connection, see
 * mail.service.ts; in tests: a fixed token against a fake Gmail behind `setGoogleFetch`). Only Google hosts
 * are reached (google-http.ts); errors never contain mail content or queries.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const UPLOAD = "https://gmail.googleapis.com/upload/gmail/v1/users/me";

export type GmailSession = {
  /** Runs one request with a valid access token (and retries once on a 401 in the app). */
  call: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
  /** The mailbox's own address, lowercase: tells the person's own messages from replies. */
  email: string;
  signal?: AbortSignal;
};

const get = <T>(session: GmailSession, url: string, maxBytes?: number) =>
  session.call((accessToken) => googleJson<T>(url, { accessToken, signal: session.signal, maxBytes }));

// ── Search and read ──────────────────────────────────────────────────────────────────────────────────

export const SEARCH_HEADERS = ["From", "To", "Subject", "Date"] as const;

/** Message ids matching a Gmail search (`q` in Gmail's own syntax), newest first, at most `limit`. */
export async function searchMessageIds(session: GmailSession, q: string, limit: number): Promise<{ id: string; threadId: string }[]> {
  const url = new URL(`${API}/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 50)));
  const page = await get<{ messages?: { id: string; threadId: string }[] }>(session, url.toString());
  return (page.messages ?? []).slice(0, limit);
}

/** A message's headers, labels and snippet (no body). */
export function getMessageMetadata(session: GmailSession, id: string): Promise<GmailMessage> {
  const url = new URL(`${API}/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "metadata");
  for (const name of [...SEARCH_HEADERS, "Message-ID", "References", "Reply-To", "Cc"]) url.searchParams.append("metadataHeaders", name);
  return get<GmailMessage>(session, url.toString());
}

/** The whole message (body parts included, attachments by reference). */
export const getFullMessage = (session: GmailSession, id: string) =>
  get<GmailMessage>(session, `${API}/messages/${encodeURIComponent(id)}?format=full`, 10_000_000);

/** A thread with its messages, full or headers only (`metadata`, for the reply check). */
export function getThread(session: GmailSession, id: string, format: "full" | "metadata" = "full"): Promise<{ id: string; messages?: GmailMessage[] }> {
  const url = new URL(`${API}/threads/${encodeURIComponent(id)}`);
  url.searchParams.set("format", format);
  if (format === "metadata") for (const name of ["From", "To", "Subject"]) url.searchParams.append("metadataHeaders", name);
  return get(session, url.toString(), format === "full" ? 20_000_000 : 2_000_000);
}

/** Downloads an attachment by Gmail's attachment id; throws when larger than `maxBytes`. */
export async function getAttachmentBytes(session: GmailSession, messageId: string, attachmentId: string, maxBytes: number): Promise<Buffer> {
  const body = await get<{ data?: string; size?: number }>(
    session,
    `${API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    // base64 is a third larger than the file.
    Math.ceil(maxBytes * 1.4) + 10_000,
  );
  const bytes = Buffer.from(body.data ?? "", "base64url");
  if (bytes.length > maxBytes) throw new Error("Attachment too large");
  return bytes;
}

// ── Drafts and sending ───────────────────────────────────────────────────────────────────────────────

/**
 * A multipart/related upload (JSON metadata + the message as message/rfc822): Gmail's upload endpoint takes
 * messages up to 35 MB, where a JSON `raw` body is limited to a few MB.
 */
export function uploadBody(metadata: unknown, mime: string, boundary = `wh-upload-${randomBytes(12).toString("hex")}`): { body: Buffer; contentType: string } {
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: message/rfc822\r\n\r\n`, "utf8"),
    Buffer.from(mime, "utf8"),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function upload<T>(session: GmailSession, method: "POST" | "PUT", path: string, metadata: unknown, mime: string): Promise<T> {
  const { body, contentType } = uploadBody(metadata, mime);
  return session.call((accessToken) =>
    googleJson<T>(`${UPLOAD}${path}?uploadType=multipart`, { method, accessToken, signal: session.signal, body, headers: { "Content-Type": contentType }, timeoutMs: 60_000 }),
  );
}

export type SentMessage = { messageId: string; threadId: string };
export type SavedDraft = SentMessage & { draftId: string };

/** Sends a message (in `threadId` when it answers one). */
export async function sendRawMessage(session: GmailSession, mime: string, threadId?: string | null): Promise<SentMessage> {
  const sent = await upload<{ id: string; threadId: string }>(session, "POST", "/messages/send", threadId ? { threadId } : {}, mime);
  return { messageId: sent.id, threadId: sent.threadId };
}

/** Saves a new draft, or replaces the draft `draftId`. */
export async function saveRawDraft(session: GmailSession, mime: string, threadId?: string | null, draftId?: string | null): Promise<SavedDraft> {
  const message = threadId ? { threadId } : {};
  const draft = draftId
    ? await upload<{ id: string; message: { id: string; threadId: string } }>(session, "PUT", `/drafts/${encodeURIComponent(draftId)}`, { id: draftId, message }, mime)
    : await upload<{ id: string; message: { id: string; threadId: string } }>(session, "POST", "/drafts", { message }, mime);
  return { draftId: draft.id, messageId: draft.message.id, threadId: draft.message.threadId };
}

/** Opening a thread in Gmail's web app, in the right account. */
export const gmailThreadUrl = (accountEmail: string, threadId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(threadId)}`;
