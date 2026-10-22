import { randomBytes } from "node:crypto";

/*
 * Building an outgoing mail as RFC 5322 / MIME text for Gmail's API (`raw`): pure functions, unit-tested in
 * mail.test.ts. No dependency: plain text bodies (UTF-8, base64), RFC 2047 encoded headers, RFC 2231 file
 * names, multipart/mixed for attachments, and reply headers (In-Reply-To, References). Header values never
 * contain CR or LF (no header injection), and addresses are checked strictly.
 */

export type MailAddress = { email: string; name?: string | null };
export type MailFile = { name: string; mimeType: string; content: Buffer };

export type OutgoingMail = {
  from?: MailAddress | null;
  to: MailAddress[];
  cc?: MailAddress[];
  subject: string;
  /** Plain text. */
  body: string;
  /** Message-ID of the mail this answers. */
  inReplyTo?: string | null;
  /** The References header of that mail (its own Message-ID is added). */
  references?: string | null;
  attachments?: MailFile[];
};

/** A reasonable address check (no quoted local parts, no IP literals, no spaces or control characters). */
export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const isEmail = (value: string) => value.length <= 254 && EMAIL_PATTERN.test(value);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
/** Header values are one line: CR, LF and other control characters become spaces. */
export const oneLine = (value: string) => value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();

const isAscii = (value: string) => /^[ -~]*$/.test(value);

/**
 * RFC 2047 "encoded words" for a header value with non-ASCII characters (`=?UTF-8?B?…?=`), split so that no
 * word is longer than 75 characters and no UTF-8 character is cut in half. ASCII text stays as it is.
 */
export function encodeHeaderWord(value: string): string {
  const text = oneLine(value);
  if (isAscii(text)) return text;
  const words: string[] = [];
  let chunk = "";
  // 45 bytes of UTF-8 → 60 base64 characters + 12 of wrapper = 72 ≤ 75.
  for (const char of text) {
    if (Buffer.byteLength(chunk + char, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** `Jan Peeters <jan@example.be>`, with the name quoted or encoded as needed. Throws on an invalid address. */
export function formatAddress(address: MailAddress): string {
  const email = address.email.trim();
  if (!isEmail(email)) throw new Error(`Invalid email address: ${oneLine(email).slice(0, 80)}`);
  const name = oneLine(address.name ?? "");
  if (!name || name.toLowerCase() === email.toLowerCase()) return email;
  if (!isAscii(name)) return `${encodeHeaderWord(name)} <${email}>`;
  return /^[A-Za-z0-9 !#$%&'*+/=?^_`{|}~-]+$/.test(name) ? `${name} <${email}>` : `"${name.replace(/[\\"]/g, "\\$&")}" <${email}>`;
}

export const formatAddressList = (addresses: MailAddress[]) => addresses.map(formatAddress).join(", ");

/** RFC 2231 file name parameters: plain when ASCII, else `filename*=UTF-8''…` (plus an ASCII fallback). */
export function fileNameParams(param: "name" | "filename", raw: string): string {
  const name = oneLine(raw).replace(/[/\\]/g, "_") || "attachment";
  if (isAscii(name)) return `${param}="${name.replace(/[\\"]/g, "\\$&")}"`;
  const fallback = name.normalize("NFD").replace(/[^ -~]/g, "").replace(/[\\"]/g, "_") || "attachment";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${param}="${fallback}"; ${param}*=UTF-8''${encoded}`;
}

/** Base64 in lines of 76 characters (RFC 2045). */
export const base64Lines = (content: Buffer) => (content.toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

const MESSAGE_ID = /^<[^<>\s]+@[^<>\s]+>$/;
/** Only well-formed `<id@host>` values go into threading headers. */
export function messageIds(value: string | null | undefined): string[] {
  return (value ?? "").split(/\s+/).filter((part) => MESSAGE_ID.test(part));
}

/** The References header of a reply: the original's References plus its Message-ID (last 20 kept). */
export function replyReferences(references: string | null | undefined, inReplyTo: string | null | undefined): string | null {
  const ids = [...new Set([...messageIds(references), ...messageIds(inReplyTo)])];
  return ids.length ? ids.slice(-20).join(" ") : null;
}

export type MimeOptions = {
  /** Fixed boundary and date for tests. */
  boundary?: string;
  date?: Date;
};

/** The whole message as MIME text with CRLF line ends, ready for base64url → Gmail `raw`. */
export function buildMimeMessage(mail: OutgoingMail, options: MimeOptions = {}): string {
  if (mail.to.length === 0) throw new Error("A mail needs at least one recipient");
  const headers: string[] = [];
  if (mail.from) headers.push(`From: ${formatAddress(mail.from)}`);
  headers.push(`To: ${formatAddressList(mail.to)}`);
  if (mail.cc?.length) headers.push(`Cc: ${formatAddressList(mail.cc)}`);
  headers.push(`Subject: ${encodeHeaderWord(mail.subject)}`);
  headers.push(`Date: ${(options.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`);
  const inReplyTo = messageIds(mail.inReplyTo)[0];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    const references = replyReferences(mail.references, inReplyTo);
    if (references) headers.push(`References: ${references}`);
  }
  headers.push("MIME-Version: 1.0");

  const body = Buffer.from(mail.body.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n"), "utf8");
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64Lines(body)];
  const attachments = mail.attachments ?? [];
  if (attachments.length === 0) return [...headers, ...textPart, ""].join("\r\n");

  const boundary = options.boundary ?? `wh-${randomBytes(12).toString("hex")}`;
  const lines = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", "This is a multi-part message in MIME format.", `--${boundary}`, ...textPart];
  for (const file of attachments) {
    const type = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(file.mimeType) ? file.mimeType.toLowerCase() : "application/octet-stream";
    lines.push(
      `--${boundary}`,
      `Content-Type: ${type}; ${fileNameParams("name", file.name)}`,
      `Content-Disposition: attachment; ${fileNameParams("filename", file.name)}`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(file.content),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

/** Gmail's `raw`: the MIME text as base64url. */
export const toGmailRaw = (mime: string) => Buffer.from(mime, "utf8").toString("base64url");
