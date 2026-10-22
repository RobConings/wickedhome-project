/**
 * Mail on the person's own Gmail: MIME building (UTF-8 subject and body, reply headers, attachments, no header
 * injection), HTML → text, quote and signature trimming, the search query, scope gating, and search / read /
 * attachments / drafts / sending against a fake Gmail (behind `setGoogleFetch`). No database, no network,
 * never a real mailbox.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/mail/mail.test.ts
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { GOOGLE_FEATURE_SCOPES } from "@/features/integrations/types/google";
import { HttpError } from "../lib/http";
import { setGoogleFetch } from "../integrations/google-http";
import { uploadBody, type GmailSession } from "./mail-gmail";
import { buildMimeMessage, encodeHeaderWord, fileNameParams, formatAddress, isEmail, replyReferences } from "./mail-mime";
import { replyNotificationText } from "./mail-replies";
import { capText, htmlToText, readMessage, replySubject, trimReply, type GmailMessage, type GmailPart } from "./mail-text";
import {
  buildSearchQuery,
  checkMailAccess,
  deliverMail,
  fetchAttachment,
  newReplies,
  parseAddressList,
  prepareMail,
  readMail,
  searchMail,
  threadState,
} from "./mail.service";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");
/** The decoded text of the base64 body part(s) of a MIME message. */
function decodedParts(mime: string): string[] {
  const parts: string[] = [];
  for (const match of mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)(?:\r\n--|\r\n$|$)/g)) {
    parts.push(Buffer.from((match[1] ?? "").replace(/\r\n/g, ""), "base64").toString("utf8"));
  }
  return parts;
}

describe("MIME building", () => {
  it("encodes a UTF-8 subject and body, and keeps headers on one line", () => {
    const mime = buildMimeMessage(
      { from: { email: "rob@example.be" }, to: [{ email: "jan@example.be", name: "Jan Peeters" }], subject: "Offerte badkamer – vóór 15/10\r\nBcc: evil@example.com", body: "Dag Jan,\nkan je één offerte maken? €\n\nRob" },
      { date: new Date("2026-10-04T10:00:00Z") },
    );
    assert.match(mime, /^From: rob@example\.be\r\nTo: Jan Peeters <jan@example\.be>\r\nSubject: =\?UTF-8\?B\?/);
    assert.doesNotMatch(mime, /\r\nBcc:/i);
    const subject = /Subject: ((?:.*\r\n )*.*)\r\n/.exec(mime)?.[1] ?? "";
    const decoded = subject
      .split("\r\n ")
      .map((word) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(word)?.[1] ?? "", "base64").toString("utf8"))
      .join("");
    assert.equal(decoded, "Offerte badkamer – vóór 15/10 Bcc: evil@example.com");
    for (const word of subject.split("\r\n ")) assert.ok(word.length <= 75, word);
    assert.match(mime, /Date: Sun, 04 Oct 2026 10:00:00 \+0000/);
    assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
    assert.equal(decodedParts(mime)[0], "Dag Jan,\r\nkan je één offerte maken? €\r\n\r\nRob");
  });

  it("adds reply headers only for well-formed message ids", () => {
    const mime = buildMimeMessage({ to: [{ email: "jan@example.be" }], subject: "Re: Offerte", body: "Ok", inReplyTo: "<abc@mail.example.be>", references: "<first@x.be> junk <abc@mail.example.be>" });
    assert.match(mime, /In-Reply-To: <abc@mail\.example\.be>\r\n/);
    assert.match(mime, /References: <first@x\.be> <abc@mail\.example\.be>\r\n/);
    const bad = buildMimeMessage({ to: [{ email: "jan@example.be" }], subject: "x", body: "y", inReplyTo: "abc\r\nBcc: x@y.z" });
    assert.doesNotMatch(bad, /In-Reply-To|Bcc/);
    assert.equal(replyReferences(null, "<a@b.c>"), "<a@b.c>");
  });

  it("builds multipart/mixed with attachments and RFC 2231 file names", () => {
    const mime = buildMimeMessage(
      { to: [{ email: "jan@example.be" }], cc: [{ email: "clara@example.be", name: "Clara" }], subject: "Plan", body: "Zie bijlage", attachments: [{ name: "plan béton.pdf", mimeType: "application/pdf", content: Buffer.from("%PDF-1.4 test") }] },
      { boundary: "BOUNDARY", date: new Date("2026-10-04T10:00:00Z") },
    );
    assert.match(mime, /Cc: Clara <clara@example\.be>/);
    assert.match(mime, /Content-Type: multipart\/mixed; boundary="BOUNDARY"/);
    assert.match(mime, /Content-Disposition: attachment; filename="plan beton\.pdf"; filename\*=UTF-8''plan%20b%C3%A9ton\.pdf/);
    assert.ok(mime.trimEnd().endsWith("--BOUNDARY--"));
    const parts = decodedParts(mime);
    assert.equal(parts[0], "Zie bijlage");
    assert.equal(parts[1], "%PDF-1.4 test");
    assert.equal(fileNameParams("filename", 'a"b.txt'), 'filename="a\\"b.txt"');
  });

  it("formats and checks addresses", () => {
    assert.equal(formatAddress({ email: "jan@example.be", name: "Peeters, Jan" }), '"Peeters, Jan" <jan@example.be>');
    assert.match(formatAddress({ email: "jan@example.be", name: "Jürgen" }), /^=\?UTF-8\?B\?.+\?= <jan@example\.be>$/);
    assert.throws(() => formatAddress({ email: "jan@example.be>\r\nBcc: x@y.z" }));
    assert.ok(isEmail("info@bouw-peeters.example.be"));
    assert.ok(!isEmail("not an email"));
    assert.equal(encodeHeaderWord("plain"), "plain");
    assert.throws(() => buildMimeMessage({ to: [], subject: "x", body: "y" }));
  });

  it("wraps the message for Gmail's multipart upload", () => {
    const { body, contentType } = uploadBody({ threadId: "t1" }, "Subject: x\r\n\r\nhi", "B");
    assert.equal(contentType, "multipart/related; boundary=B");
    const text = body.toString("utf8");
    assert.match(text, /--B\r\nContent-Type: application\/json; charset=UTF-8\r\n\r\n\{"threadId":"t1"\}\r\n--B\r\nContent-Type: message\/rfc822\r\n\r\nSubject: x/);
    assert.ok(text.endsWith("\r\n--B--\r\n"));
  });
});

describe("mail text", () => {
  it("turns HTML into readable text", () => {
    const text = htmlToText(
      `<html><head><style>p{color:red}</style><title>x</title></head><body><script>alert(1)</script><p>Dag Rob,</p><p>De prijs is &euro;&nbsp;1.250 &amp; btw.<br>Groeten</p><ul><li>Tegels</li><li>Lijm</li></ul><blockquote>Oud bericht</blockquote><div class="gmail_quote">Op ma schreef Rob: vroeger</div></body></html>`,
    );
    assert.equal(text, "Dag Rob,\n\nDe prijs is € 1.250 & btw.\nGroeten\n\n- Tegels\n- Lijm");
  });

  it("cuts quoted replies and obvious signatures (NL, EN, Outlook)", () => {
    assert.deepEqual(trimReply("Prima, dinsdag past.\n\nOp za 4 okt. 2026 om 10:00 schreef Rob <rob@example.be>:\n> Past dinsdag?"), { text: "Prima, dinsdag past.", trimmed: true });
    assert.equal(trimReply("Sure.\n\nOn Sat, Oct 4, 2026 at 10:00 AM Rob wrote:\n> old").text, "Sure.");
    assert.equal(trimReply("Hier de offerte.\n-- \nJan Peeters\nBouw Peeters").text, "Hier de offerte.");
    assert.equal(trimReply("Ok\n\nVerzonden vanaf mijn iPhone").text, "Ok");
    assert.equal(trimReply("Zie hieronder\n\nVan: Rob\nVerzonden: zaterdag\nAan: Jan\nOnderwerp: x").text, "Zie hieronder");
    assert.deepEqual(trimReply("Gewoon een bericht\nmet twee regels"), { text: "Gewoon een bericht\nmet twee regels", trimmed: false });
    assert.equal(capText("een twee drie vier", 10).text, "een twee …");
  });

  it("reads a Gmail message: headers, text, attachments", () => {
    const message: GmailMessage = {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      internalDate: String(Date.parse("2026-10-03T08:30:00Z")),
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: '"Jan Peeters" <Jan@Example.be>' },
          { name: "Subject", value: "Offerte badkamer" },
          { name: "Message-ID", value: "<q1@example.be>" },
        ],
        parts: [
          { partId: "0", mimeType: "text/html", body: { data: b64("<p>Dag Rob, zie offerte.</p>") } },
          { partId: "1", mimeType: "application/pdf", filename: "offerte.pdf", body: { attachmentId: "att-1", size: 1234 } },
        ],
      },
    };
    const read = readMessage(message);
    assert.equal(read.fromEmail, "jan@example.be");
    assert.equal(read.text, "Dag Rob, zie offerte.");
    assert.equal(read.unread, true);
    assert.equal(read.date, "2026-10-03T08:30:00.000Z");
    assert.deepEqual(read.attachments, [{ part: "1", name: "offerte.pdf", mimeType: "application/pdf", sizeBytes: 1234 }]);
    assert.equal(replySubject("Offerte badkamer"), "Re: Offerte badkamer");
    assert.equal(replySubject("Antw: Offerte"), "Antw: Offerte");
  });

  it("builds Gmail searches from simple filters", () => {
    assert.equal(buildSearchQuery({}), "in:inbox");
    assert.equal(
      buildSearchQuery({ query: "offerte", from: "Jan Peeters", subject: "badkamer (nieuw)", after: "2026-09-01", before: "2026-09-30", hasAttachment: true, unread: true }),
      'offerte from:"Jan Peeters" subject:(badkamer nieuw) after:2026/09/01 before:2026/10/01 has:attachment is:unread',
    );
    assert.equal(buildSearchQuery({ to: "jan@example.be\r\nx" }), "to:\"jan@example.be x\"");
  });

  it("parses address lists", () => {
    assert.deepEqual(parseAddressList('"Peeters, Jan" <jan@example.be>, piet@example.be, nonsense'), [
      { email: "jan@example.be", name: "Peeters, Jan" },
      { email: "piet@example.be", name: "piet@example.be" },
    ]);
  });
});

describe("scope gating", () => {
  const read = [...GOOGLE_FEATURE_SCOPES.gmail];
  const send = [...GOOGLE_FEATURE_SCOPES.gmail_send];
  const code = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (error) {
      return error instanceof HttpError ? `${error.status} ${error.code}: ${error.message}` : String(error);
    }
  };

  it("asks for the send permission with a clear message", () => {
    const message = code(() => checkMailAccess({ status: "CONNECTED", scopes: read }, "send")) ?? "";
    assert.match(message, /^409 gmail_send_off: /);
    assert.ok(message.includes('"Send mail from the assistant"') && message.includes("Integrations page"), message);
    assert.equal(code(() => checkMailAccess({ status: "CONNECTED", scopes: [...read, ...send] }, "send")), null);
    assert.deepEqual(checkMailAccess({ status: "CONNECTED", scopes: [...read, ...send] }, "read"), { canRead: true, canSend: true });
  });

  it("explains a missing connection, reconnect or read permission", () => {
    assert.match(code(() => checkMailAccess(null, "read")) ?? "", /^409 gmail_not_connected/);
    assert.match(code(() => checkMailAccess({ status: "NEEDS_RECONNECT", scopes: read }, "read")) ?? "", /reconnected/);
    assert.match(code(() => checkMailAccess({ status: "CONNECTED", scopes: send }, "read")) ?? "", /^409 gmail_read_off/);
  });
});

describe("reply tracking", () => {
  const message = (id: string, from: string, at: string, labels: string[] = []): GmailMessage => ({
    id,
    threadId: "t1",
    labelIds: labels,
    internalDate: String(Date.parse(at)),
    payload: { headers: [{ name: "From", value: from }, { name: "Subject", value: "Offerte" }] },
  });
  const thread = [
    message("m1", "Rob <rob@example.be>", "2026-10-01T10:00:00Z", ["SENT"]),
    message("m2", "Jan Peeters <jan@example.be>", "2026-10-02T09:00:00Z", ["INBOX"]),
    message("m3", "Rob <rob@example.be>", "2026-10-03T09:00:00Z", ["DRAFT"]),
  ];

  it("finds replies from others after what was seen; a new link starts quiet", () => {
    assert.deepEqual(newReplies(thread, "rob@example.be", new Date("2026-10-01T10:00:00Z")).map((entry) => entry.id), ["m2"]);
    assert.deepEqual(newReplies(thread, "rob@example.be", new Date("2026-10-02T09:00:00Z")), []);
    assert.deepEqual(newReplies(thread, "rob@example.be", null), []);
    assert.deepEqual(threadState(thread, "rob@example.be"), { count: 2, lastAt: new Date("2026-10-02T09:00:00Z"), lastFromName: "Jan Peeters", lastFromEmail: "jan@example.be", lastFromMe: false });
  });

  it("writes the notification in the person's language", () => {
    const notice = { from: "Jan Peeters", subject: "Re: Offerte", snippet: "Dinsdag past", projectName: "Badkamer renovatie" };
    assert.deepEqual(replyNotificationText(notice, 1, "en"), { title: "Jan Peeters replied about Badkamer renovatie", body: "Re: Offerte — “Dinsdag past”" });
    assert.equal(replyNotificationText(notice, 2, "nl").title, "Jan Peeters antwoordde 2 keer over Badkamer renovatie");
    assert.equal(replyNotificationText({ ...notice, projectName: null }, 1, "nl").title, "Jan Peeters antwoordde over Re: Offerte");
  });
});

// ── A fake Gmail ─────────────────────────────────────────────────────────────────────────────────────

type Upload = { path: string; method: string; metadata: Record<string, unknown>; mime: string };

function fakeGmail() {
  const messages = new Map<string, GmailMessage>();
  const uploads: Upload[] = [];
  const queries: string[] = [];
  const requests: string[] = [];
  const add = (message: GmailMessage) => messages.set(message.id, message);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  const strip = (part: GmailPart | undefined): GmailPart | undefined =>
    part && { ...part, body: part.body && { ...part.body, data: undefined }, parts: part.parts?.map((child) => strip(child) as GmailPart) };

  setGoogleFetch(async (input, init) => {
    const url = new URL(input.toString());
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.hostname !== "gmail.googleapis.com") return json({ error: "wrong host" }, 400);
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer test-token") return json({ error: { status: "UNAUTHENTICATED" } }, 401);
    const path = url.pathname.replace("/gmail/v1/users/me", "").replace("/upload", "");
    if (init?.method === "POST" || init?.method === "PUT") {
      const contentType = (init.headers as Record<string, string>)["Content-Type"] ?? "";
      const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? "";
      const text = Buffer.from(init.body as Uint8Array).toString("utf8");
      const [, jsonPart = "", mimePart = ""] = text.split(`--${boundary}`);
      const metadata = JSON.parse(jsonPart.split("\r\n\r\n")[1] ?? "{}") as Record<string, unknown>;
      const mime = mimePart.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
      uploads.push({ path, method: init.method, metadata, mime });
      const threadId = ((metadata.threadId as string) ?? (metadata.message as { threadId?: string } | undefined)?.threadId) || `t-new-${uploads.length}`;
      if (path === "/messages/send") return json({ id: `sent-${uploads.length}`, threadId, labelIds: ["SENT"] });
      if (path.startsWith("/drafts")) return json({ id: `draft-${uploads.length}`, message: { id: `dm-${uploads.length}`, threadId } });
      return json({ error: "unknown" }, 404);
    }
    if (path === "/messages") {
      queries.push(url.searchParams.get("q") ?? "");
      const max = Number(url.searchParams.get("maxResults") ?? 100);
      return json({ messages: [...messages.values()].slice(0, max).map((message) => ({ id: message.id, threadId: message.threadId })) });
    }
    const attachment = /^\/messages\/([^/]+)\/attachments\/([^/]+)$/.exec(path);
    if (attachment) return json({ data: Buffer.from(`bytes of ${attachment[2]}`).toString("base64url") });
    const single = /^\/messages\/([^/]+)$/.exec(path);
    if (single) {
      const message = messages.get(decodeURIComponent(single[1] ?? ""));
      if (!message) return json({ error: { status: "NOT_FOUND" } }, 404);
      return json(url.searchParams.get("format") === "metadata" ? { ...message, payload: strip(message.payload) } : message);
    }
    const thread = /^\/threads\/([^/]+)$/.exec(path);
    if (thread) return json({ id: thread[1], messages: [...messages.values()].filter((message) => message.threadId === thread[1]) });
    return json({ error: "unknown" }, 404);
  });
  return { add, uploads, queries, requests };
}

describe("search, read, attachments, drafts and sending (fake Gmail)", () => {
  const realFetch = setGoogleFetch((input, init) => fetch(input, init));
  after(() => setGoogleFetch(realFetch));
  const session: GmailSession = { email: "rob@example.be", call: (work) => work("test-token") };
  let gmail: ReturnType<typeof fakeGmail>;

  beforeEach(() => {
    gmail = fakeGmail();
    gmail.add({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Dag Rob, hierbij de offerte voor de badkamer &amp; toilet",
      internalDate: String(Date.parse("2026-10-02T09:00:00Z")),
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Jan Peeters <jan@example.be>" },
          { name: "To", value: "rob@example.be" },
          { name: "Subject", value: "Offerte badkamer" },
          { name: "Message-ID", value: "<offerte-1@example.be>" },
          { name: "References", value: "<start@example.be>" },
        ],
        parts: [
          { partId: "0", mimeType: "text/plain", body: { data: b64("Dag Rob,\nhierbij de offerte.\n\nOp do 1 okt. 2026 schreef Rob:\n> Kan je een offerte maken?") } },
          { partId: "1", mimeType: "application/pdf", filename: "offerte-badkamer.pdf", body: { attachmentId: "att-xyz", size: 20 } },
          { partId: "2", mimeType: "image/png", filename: "logo.png", body: { attachmentId: "att-logo", size: 10 } },
        ],
      },
    });
  });

  it("searches compactly", async () => {
    const items = await searchMail(session, { from: "jan@example.be", limit: 5 });
    assert.deepEqual(gmail.queries, ["from:jan@example.be"]);
    assert.equal(items.length, 1);
    assert.deepEqual(
      { from: items[0]?.from, subject: items[0]?.subject, unread: items[0]?.unread, snippet: items[0]?.snippet },
      { from: "Jan Peeters", subject: "Offerte badkamer", unread: true, snippet: "Dag Rob, hierbij de offerte voor de badkamer & toilet" },
    );
  });

  it("reads a message and its thread, quotes trimmed", async () => {
    const one = await readMail(session, "m1");
    assert.equal(one.messages[0]?.text, "Dag Rob,\nhierbij de offerte.");
    assert.equal(one.messages[0]?.trimmed, true);
    assert.equal(one.messages[0]?.attachments.length, 2);
    const thread = await readMail(session, "m1", { thread: true });
    assert.equal(thread.messages.length, 1);
    await assert.rejects(readMail(session, "nope"), (error: unknown) => error instanceof HttpError && error.status === 404);
  });

  it("fetches the PDF attachment by default, or one by name", async () => {
    const pdf = await fetchAttachment(session, "m1");
    assert.equal(pdf.name, "offerte-badkamer.pdf");
    assert.equal(pdf.mimeType, "application/pdf");
    assert.equal(pdf.content.toString(), "bytes of att-xyz");
    assert.equal((await fetchAttachment(session, "m1", "logo")).name, "logo.png");
    await assert.rejects(fetchAttachment(session, "m1", "missing.doc"), /No attachment/);
  });

  it("replies in the thread: sender, Re: subject, threading headers", async () => {
    const prepared = await prepareMail("h1", session, { to: [], body: "Dag Jan,\nbedankt, dinsdag past.\nRob", replyToMessageId: "m1" });
    assert.equal(prepared.threadId, "t1");
    assert.equal(prepared.mail.subject, "Re: Offerte badkamer");
    assert.deepEqual(prepared.mail.to, [{ email: "jan@example.be", name: "Jan Peeters" }]);
    const sent = await deliverMail(session, prepared, "send");
    assert.deepEqual(sent, { action: "send", messageId: "sent-1", threadId: "t1", draftId: null });
    const upload = gmail.uploads[0];
    assert.equal(upload?.path, "/messages/send");
    assert.deepEqual(upload?.metadata, { threadId: "t1" });
    assert.match(upload?.mime ?? "", /In-Reply-To: <offerte-1@example\.be>\r\nReferences: <start@example\.be> <offerte-1@example\.be>/);
    assert.match(upload?.mime ?? "", /From: rob@example\.be\r\nTo: Jan Peeters <jan@example\.be>/);
  });

  it("saves a new mail as a Gmail draft", async () => {
    const prepared = await prepareMail("h1", session, { to: [{ email: "info@bouw.example.be" }], subject: "Vraag offerte", body: "Dag,\nkunnen jullie een offerte maken?" });
    const draft = await deliverMail(session, prepared, "draft");
    assert.equal(draft.action, "draft");
    assert.equal(draft.draftId, "draft-1");
    assert.equal(gmail.uploads[0]?.path, "/drafts");
    assert.deepEqual(gmail.uploads[0]?.metadata, { message: {} });
    assert.ok(!gmail.requests.some((line) => line.includes("/messages/send")), "a draft is never sent");
  });

  it("refuses a mail without recipient or subject", async () => {
    await assert.rejects(prepareMail("h1", session, { to: [], subject: "x", body: "y" }), /Who should the mail go to/);
    await assert.rejects(prepareMail("h1", session, { to: [{ email: "a@example.be" }], subject: " ", body: "y" }), /needs a subject/);
  });
});
