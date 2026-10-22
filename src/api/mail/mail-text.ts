/*
 * Reading Gmail messages as short plain text: pure functions, unit-tested in mail.test.ts. A message body is
 * turned into readable text (HTML without tags), the quoted earlier conversation and obvious signatures are
 * cut, and everything is capped, so a small local model gets the gist in a few hundred tokens.
 *
 * Mail content is untrusted: nothing here interprets it; the assistant skill wraps it as data
 * (ai/skills/mail/tools.ts).
 */

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

/** An attachment of a message. `part` is Gmail's part id: stable, unlike Gmail's attachment id. */
export type MailAttachmentInfo = { part: string; name: string; mimeType: string; sizeBytes: number };

/** A message as the mail service hands it out: headers, trimmed text, attachments. */
export type ReadMessage = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string | null;
  to: string;
  cc: string;
  subject: string;
  /** ISO instant. */
  date: string | null;
  unread: boolean;
  sent: boolean;
  draft: boolean;
  text: string;
  /** Whether quoted text, a signature or the end of a long body was cut. */
  trimmed: boolean;
  attachments: MailAttachmentInfo[];
  /** Threading headers, for replies. */
  messageIdHeader: string | null;
  references: string | null;
  replyTo: string | null;
};

export const DEFAULT_TEXT_LIMIT = 2500;

// ── Headers ──────────────────────────────────────────────────────────────────────────────────────────

export function headerOf(part: GmailPart | undefined, name: string): string {
  const wanted = name.toLowerCase();
  return part?.headers?.find((entry) => entry.name.toLowerCase() === wanted)?.value ?? "";
}

/** `"Jan Peeters" <Jan@Example.be>` → `jan@example.be`. */
export function addressOf(header: string): string | null {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(header) ?? /([^\s<>",;]+@[^\s<>",;]+)/.exec(header);
  return match?.[1]?.toLowerCase() ?? null;
}

/** `"Jan Peeters" <jan@example.be>` → `Jan Peeters`; a bare address stays the address. */
export function displayNameOf(header: string): string {
  const name = header.replace(/<[^>]*>/, "").replace(/^\s*"|"\s*$/g, "").trim();
  return name || addressOf(header) || header.trim();
}

// ── HTML to text ─────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  euro: "€",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  copy: "©",
  eacute: "é",
  egrave: "è",
  euml: "ë",
  iuml: "ï",
  ouml: "ö",
  uuml: "ü",
  agrave: "à",
  ccedil: "ç",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return safeChar(parseInt(code.slice(2), 16)) ?? whole;
    if (code.startsWith("#")) return safeChar(Number(code.slice(1))) ?? whole;
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function safeChar(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}

/** HTML mail → readable text: no scripts, styles or tags; line breaks for blocks, "- " for list items. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    // Quoted earlier messages (Gmail, Apple Mail, Outlook web): never part of what this message says.
    .replace(/<blockquote\b[\s\S]*?<\/blockquote\s*>/gi, "\n")
    .replace(/<div\b[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|tr|ul|ol|table|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<(p|div|tr|table|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return normalizeWhitespace(decodeEntities(text));
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u00a0\u202f ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Quotes and signatures ────────────────────────────────────────────────────────────────────────────

/** Lines that start the quoted earlier conversation, in Dutch, English and French mail clients. */
const QUOTE_STARTS = [
  /^on .{3,200} wrote:?$/i,
  /^op .{3,200} (schreef|heeft .{0,60} geschreven).{0,40}:?$/i,
  /^le .{3,200} a écrit\s?:?$/i,
  /^-{2,}\s*(original message|oorspronkelijk bericht|origineel bericht|message d'origine|forwarded message|doorgestuurd bericht)\s*-{2,}$/i,
  /^_{10,}$/,
];
/** An Outlook-style header block: "From: …" followed within two lines by "Sent:/Date:/Verzonden:/Datum:". */
const OUTLOOK_FROM = /^(from|van|de)\s*:/i;
const OUTLOOK_NEXT = /^(sent|date|verzonden|datum|envoyé|to|aan|à)\s*:/i;

/** Signatures that are obviously not content. */
const SIGNATURE_LINES = [
  /^-- ?$/,
  /^(sent from|verzonden (vanaf|vanuit|met)|verstuurd (vanaf|vanuit|met)|envoyé de) (my |mijn )?.{0,40}$/i,
  /^get outlook for .{0,30}$/i,
];

/** Cuts the quoted earlier messages and an obvious signature. `trimmed` says whether anything was cut. */
export function trimReply(text: string): { text: string; trimmed: boolean } {
  const lines = text.split("\n");
  let end = lines.length;
  for (let index = 0; index < lines.length; index++) {
    const line = (lines[index] ?? "").trim();
    // Never cut the very first line: a message that is only a quote keeps something.
    if (index === 0) continue;
    const quoteStart =
      QUOTE_STARTS.some((pattern) => pattern.test(line)) ||
      (OUTLOOK_FROM.test(line) && [1, 2].some((offset) => OUTLOOK_NEXT.test((lines[index + offset] ?? "").trim()))) ||
      (line.startsWith(">") && lines.slice(index).every((rest) => !rest.trim() || rest.trim().startsWith(">")));
    const signature = SIGNATURE_LINES.some((pattern) => pattern.test(line));
    if (quoteStart || signature) {
      end = index;
      break;
    }
  }
  const kept = lines
    .slice(0, end)
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
  const trimmed = end < lines.length || kept.length < lines.slice(0, end).join("\n").trim().length;
  return { text: kept || text.trim(), trimmed };
}

/** Cuts a text to `limit` characters at a word boundary, marking the cut. */
export function capText(text: string, limit: number): { text: string; capped: boolean } {
  if (text.length <= limit) return { text, capped: false };
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return { text: `${(space >= limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()} …`, capped: true };
}

// ── Messages ─────────────────────────────────────────────────────────────────────────────────────────

export function walkParts(part: GmailPart | undefined, visit: (part: GmailPart) => void): void {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walkParts(child, visit);
}

const decodeBase64Url = (data: string) => Buffer.from(data, "base64url").toString("utf8");

/** The body as text: the text/plain parts, else the HTML parts converted (attachments never). */
export function messageBody(message: GmailMessage): string {
  let plain = "";
  let html = "";
  walkParts(message.payload, (part) => {
    if (!part.body?.data || part.filename) return;
    const type = (part.mimeType ?? "").toLowerCase();
    if (type === "text/plain") plain += `${decodeBase64Url(part.body.data)}\n`;
    else if (type === "text/html") html += `${decodeBase64Url(part.body.data)}\n`;
  });
  return plain.trim() ? normalizeWhitespace(plain) : htmlToText(html);
}

export function attachmentsOf(message: GmailMessage): MailAttachmentInfo[] {
  const found: MailAttachmentInfo[] = [];
  walkParts(message.payload, (part) => {
    if (!part.filename || !part.body?.attachmentId || !part.partId) return;
    found.push({ part: part.partId, name: part.filename, mimeType: (part.mimeType ?? "application/octet-stream").toLowerCase(), sizeBytes: part.body.size ?? 0 });
  });
  return found;
}

/** A Gmail message (format=full) as plain data: headers, trimmed body capped at `limit`, attachments. */
export function readMessage(message: GmailMessage, limit = DEFAULT_TEXT_LIMIT): ReadMessage {
  const payload = message.payload;
  const labels = new Set(message.labelIds ?? []);
  const reply = trimReply(messageBody(message));
  const capped = capText(reply.text, limit);
  const internal = Number(message.internalDate);
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    from: headerOf(payload, "From"),
    fromEmail: addressOf(headerOf(payload, "From")),
    to: headerOf(payload, "To"),
    cc: headerOf(payload, "Cc"),
    subject: headerOf(payload, "Subject"),
    date: Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : null,
    unread: labels.has("UNREAD"),
    sent: labels.has("SENT"),
    draft: labels.has("DRAFT"),
    text: capped.text,
    trimmed: reply.trimmed || capped.capped,
    attachments: attachmentsOf(message),
    messageIdHeader: headerOf(payload, "Message-ID") || headerOf(payload, "Message-Id") || null,
    references: headerOf(payload, "References") || null,
    replyTo: headerOf(payload, "Reply-To") || null,
  };
}

/** "Re: Offerte" stays; "Offerte" → "Re: Offerte" (also keeps Dutch/German "Antw:", "AW:"). */
export function replySubject(subject: string): string {
  const clean = subject.trim();
  return /^(re|antw|aw|sv|réf)\s*:/i.test(clean) ? clean : `Re: ${clean || "(no subject)"}`;
}
