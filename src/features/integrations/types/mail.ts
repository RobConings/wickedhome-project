import { z } from "zod";

/*
 * Mail on the person's own Gmail, written by the assistant (ai/skills/mail) and linked to projects. Contracts
 * shared by src/api/mail and the browser: the confirmation-card preview of a mail (`kind: "mail"`) and the
 * mails shown on a project page. Each person only ever sees their own mailbox.
 */

// ── The confirmation card of a mail ──────────────────────────────────────────────────────────────────

export const MAIL_PREVIEW_KIND = "mail";

/** The arguments of `mail.compose` the person may change on the card before Send / Save as draft. */
export const MAIL_EDITABLE_FIELDS = ["subject", "body"] as const;
export type MailEditableField = (typeof MAIL_EDITABLE_FIELDS)[number];

export const MAIL_SUBJECT_MAX = 200;
export const MAIL_BODY_MAX = 20_000;

/**
 * `data` of a `mail` preview: what will be sent, as the card shows it. Validated in the renderer (it comes
 * from the server). Addresses are formatted "Jan Peeters <jan@example.be>".
 */
export const mailPreviewDataSchema = z.object({
  from: z.string().max(320).nullable(),
  to: z.array(z.string().max(320)).max(20),
  cc: z.array(z.string().max(320)).max(20),
  subject: z.string().max(MAIL_SUBJECT_MAX),
  body: z.string().max(MAIL_BODY_MAX),
  attachments: z.array(z.object({ name: z.string().max(200), sizeBytes: z.number().int().min(0) })).max(20),
  /** The subject of the mail this answers, when it is a reply. */
  replyTo: z.string().max(MAIL_SUBJECT_MAX).nullable(),
  /** The project it will be linked to. */
  project: z.string().max(200).nullable(),
});
export type MailPreviewData = z.infer<typeof mailPreviewDataSchema>;

// ── Mails on a project ───────────────────────────────────────────────────────────────────────────────

/** One linked Gmail thread of the signed-in person. */
export type MailThreadInfo = {
  id: string;
  subject: string;
  /** The other side ("Jan Peeters"), when known. */
  counterpart: string | null;
  messageCount: number;
  /** ISO instant of the newest message. */
  lastMessageAt: string | null;
  lastFromName: string | null;
  /** The newest message is the person's own (waiting for an answer) rather than a reply. */
  lastFromMe: boolean;
  /** Opens the thread in Gmail (the right account). */
  gmailUrl: string;
};

/** `GET /api/mail/threads?projectId=…`: your own mails about a project (empty without Gmail). */
export type ProjectMailThreads = {
  /** Gmail reading is switched on for you. */
  connected: boolean;
  threads: MailThreadInfo[];
};

export const projectMailQuerySchema = z.object({ projectId: z.string().trim().min(1).max(64) });
