import { z } from "zod";
import { idSchema } from "@/types/common";
import type { IntegrationStatus } from "./integrations";
import type { MailLinkMatch } from "./mail-matching";

/*
 * Google, per user: one OAuth connection per WickedHome account, with scopes requested per feature
 * (incremental consent). Contracts for `/api/integrations/google/*`. See docs/INTEGRATIONS.md.
 */

// ── Features and scopes ──────────────────────────────────────────────────────────────────────────────

/**
 * What someone can switch on. Each asks Google only for the scopes it needs, when it is switched on:
 * - `calendar`: read the calendar list and events (`calendar.readonly`).
 * - `calendar_publish`: write events, for publishing household events to one calendar (`calendar.events`).
 * - `gmail`: read mail (`gmail.readonly`): bill suggestions, and the assistant searching and reading your own
 *   mail when you ask it to; nothing is ever sent or changed with it.
 * - `gmail_send`: "Send mail from the assistant" (`gmail.send` + `gmail.compose`): mails the assistant writes
 *   are sent or saved as a Gmail draft, each only after you tapped Send / Save as draft on its card.
 * - `drive`: browse linked folders (`drive.readonly`) and save copies into a folder the app creates (`drive.file`).
 * - `drive_full`: write into an existing folder the person picks, for storing bill documents there (`drive`, a
 *   restricted scope); only asked when someone chooses that option (see types/drive-storage.ts).
 */
export const GOOGLE_FEATURES = ["calendar", "calendar_publish", "gmail", "gmail_send", "drive", "drive_full"] as const;
export const googleFeatureSchema = z.enum(GOOGLE_FEATURES);
export type GoogleFeature = z.infer<typeof googleFeatureSchema>;

const SCOPE = "https://www.googleapis.com/auth/";

/** Always requested: who the Google account is (its email), nothing else. */
export const GOOGLE_BASE_SCOPES = ["openid", "email"] as const;

export const GOOGLE_FEATURE_SCOPES: Record<GoogleFeature, readonly string[]> = {
  calendar: [`${SCOPE}calendar.readonly`],
  calendar_publish: [`${SCOPE}calendar.events`],
  gmail: [`${SCOPE}gmail.readonly`],
  gmail_send: [`${SCOPE}gmail.send`, `${SCOPE}gmail.compose`],
  drive: [`${SCOPE}drive.readonly`, `${SCOPE}drive.file`],
  drive_full: [`${SCOPE}drive`],
};

/** The features whose scopes are all granted. */
export function featuresFromScopes(scopes: readonly string[]): GoogleFeature[] {
  const granted = new Set(scopes);
  return GOOGLE_FEATURES.filter((feature) => GOOGLE_FEATURE_SCOPES[feature].every((scope) => granted.has(scope)));
}

/** Body of `POST /api/integrations/google/start`: the features to (additionally) ask consent for. */
export const googleStartInputSchema = z.object({
  features: z.array(googleFeatureSchema).min(1).max(GOOGLE_FEATURES.length),
});
export type GoogleStartInput = z.infer<typeof googleStartInputSchema>;

/** `?google=` on `/integrations` after the consent screen. `finish` means: complete the connection now. */
export const GOOGLE_RETURN_PARAM = "google";
export const GOOGLE_RETURN_STATES = ["finish", "denied", "expired", "error"] as const;
export type GoogleReturnState = (typeof GOOGLE_RETURN_STATES)[number];

// ── Status ───────────────────────────────────────────────────────────────────────────────────────────

export type GoogleConnectionInfo = {
  /** The Google account's address, e.g. "rob@gmail.com". */
  email: string;
  /** `needs_reconnect`: Google refused the stored consent (revoked, expired); connect again. */
  status: "connected" | "needs_reconnect";
  lastError: string | null;
  connectedAt: string;
  features: GoogleFeature[];
};

export const GOOGLE_CALENDAR_VISIBILITIES = ["household", "private"] as const;
export const googleCalendarVisibilitySchema = z.enum(GOOGLE_CALENDAR_VISIBILITIES);
/** `household`: everyone in the household sees its events; `private`: only you. */
export type GoogleCalendarVisibility = z.infer<typeof googleCalendarVisibilitySchema>;

/** One of the person's Google calendars. `id` is ours; Google's id is never needed by the UI. */
export type GoogleCalendarInfo = {
  id: string;
  name: string;
  /** `#rrggbb`, the calendar's colour in Google. */
  color: string;
  primary: boolean;
  /** Owner or writer: can be the target for publishing. */
  canWrite: boolean;
  selected: boolean;
  visibility: GoogleCalendarVisibility;
  eventCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type GooglePublishSettings = {
  /** Our id of the target calendar; `null` = publishing is off (the default). */
  calendarId: string | null;
  /** Household event categories that are pushed (lowercase calendar categories). */
  categories: string[];
  publishedCount: number;
  lastPublishedAt: string | null;
  lastError: string | null;
};

export type GoogleCalendarSettings = {
  calendars: GoogleCalendarInfo[];
  publish: GooglePublishSettings;
};

export type GoogleMailSettings = {
  lastScanAt: string | null;
  lastError: string | null;
  /** Suggestions from this mailbox still waiting for Accept / Dismiss. */
  pendingCount: number;
};

export type GoogleDriveSettings = {
  /** Folders of this person's Drive linked into the household's documents. */
  linkCount: number;
  /**
   * Documents WickedHome stored in this person's Drive as a storage target (bill documents). They stop opening
   * in WickedHome while this person is disconnected; the disconnect confirmation says so.
   */
  storedFileCount?: number;
};

/** `GET /api/integrations/google`: everything the Google card shows for the signed-in person. */
export type GoogleStatus = {
  status: IntegrationStatus;
  /** `.env` variables the server still needs (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_KEY`). */
  missing: string[];
  /** The redirect URI to register in Google Cloud (from `GOOGLE_REDIRECT_URI`). */
  redirectUri: string;
  /** Origin the consent screen returns to; connecting must start from there (the session cookie lives there). */
  connectOrigin: string;
  connection: GoogleConnectionInfo | null;
  /** Present when the calendar feature is granted. */
  calendar: GoogleCalendarSettings | null;
  gmail: GoogleMailSettings | null;
  drive: GoogleDriveSettings | null;
};

// ── Calendar inputs ──────────────────────────────────────────────────────────────────────────────────

/** Body of `PATCH /api/integrations/google/calendars/:id`. */
export const googleCalendarUpdateSchema = z
  .object({ selected: z.boolean().optional(), visibility: googleCalendarVisibilitySchema.optional() })
  .refine((value) => value.selected !== undefined || value.visibility !== undefined, { message: "Nothing to update" });
export type GoogleCalendarUpdate = z.infer<typeof googleCalendarUpdateSchema>;

/** Body of `PUT /api/integrations/google/calendar/publish`. The API checks the categories. */
export const googlePublishInputSchema = z.object({
  calendarId: idSchema.nullable(),
  categories: z.array(z.string().min(1).max(40)).max(20),
});
export type GooglePublishInput = z.infer<typeof googlePublishInputSchema>;

// ── Gmail bill suggestions ───────────────────────────────────────────────────────────────────────────

/** A sender: a full address (`facturen@fluvius.be`) or a domain (`fluvius.be`, also matching subdomains). */
export const mailSenderSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^([a-z0-9._%+-]+@)?([a-z0-9-]+\.)+[a-z]{2,}$/, { message: "invalidSender" });

/** Body of `POST /api/integrations/google/mail/rules` and `PUT …/rules/:id`. `category`: an expense category. */
export const mailBillRuleInputSchema = z.object({
  payee: z.string().trim().min(1).max(80),
  senders: z.array(mailSenderSchema).min(1).max(10),
  category: z.string().min(1).max(40),
  enabled: z.boolean().default(true),
});
export type MailBillRuleInput = z.infer<typeof mailBillRuleInputSchema>;

/** Which mails count as a bill of one payee. Household-wide; each connected mailbox is searched with them. */
export type MailBillRule = {
  id: string;
  payee: string;
  senders: string[];
  category: string;
  enabled: boolean;
  /** One of the built-in Belgian providers (still editable). */
  builtIn: boolean;
  /** "Always link mails from this sender to …": the remembered recurring expense, if any. */
  recurringExpenseId: string | null;
};

/** `linked`: linked to an expense that already existed (or a recurring expense's occurrence). */
export const MAIL_SUGGESTION_STATUSES = ["pending", "accepted", "dismissed", "linked"] as const;
export type MailSuggestionStatus = (typeof MAIL_SUGGESTION_STATUSES)[number];

/**
 * A bill found in someone's mail, waiting for a decision. Only extracted fields are kept, never the mail:
 * the PDF is fetched again from Gmail when the suggestion is accepted, and then stored in Documents.
 */
export type MailBillSuggestion = {
  id: string;
  payee: string;
  category: string;
  /** Subject line, shortened. */
  subject: string;
  receivedAt: string;
  amountCents: number | null;
  dueDate: string | null;
  /** 12 digits, check digits verified. */
  structuredCommunication: string | null;
  iban: string | null;
  attachmentName: string | null;
  /** Whose mailbox it came from. */
  mailboxOwner: string;
  status: MailSuggestionStatus;
  /** Expenses it probably belongs to, best first (`matches[0].strong`: "Looks like …"). */
  matches: MailLinkMatch[];
  /** The sender's remembered recurring expense ("Always link mails from this sender to …"). */
  rememberedRecurringId: string | null;
};

/**
 * `GET /api/integrations/google/mail/suggestions/:id/mail`: the text of the suggestion's mail, to check before
 * accepting: the body as plain text (HTML mails without their markup). The PDF itself: `mailSuggestionPdfUrl`.
 */
export type MailBillSuggestionMail = { text: string; hasPdf: boolean };

/** The suggestion's PDF, fetched from the mailbox (inline, for a frame or a new tab). */
export const mailSuggestionPdfUrl = (id: string) => `/api/integrations/google/mail/suggestions/${encodeURIComponent(id)}/pdf`;

/** Body of `POST /api/integrations/google/mail/suggestions/:id/accept`: the expense that was saved for it. */
export const mailSuggestionAcceptSchema = z.object({ expenseId: idSchema });

/** What the "Suggested from mail" list needs: the pending suggestions of the whole household. */
export type MailSuggestionList = {
  suggestions: MailBillSuggestion[];
};

// ── Drive ────────────────────────────────────────────────────────────────────────────────────────────

export type DriveItem = {
  /** Google's file id. */
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  /** `null` for folders and Google Docs (no stored size). */
  sizeBytes: number | null;
  modifiedAt: string | null;
  /** Opening it in Google Drive. */
  webUrl: string | null;
  /** Whether WickedHome can open/import it (Google Docs, Sheets and Slides are exported as PDF). */
  downloadable: boolean;
  /** Can be added to Documents as a link that stays in Drive (real files only, not Google Docs). */
  linkable: boolean;
};

/** A Drive folder linked into the household's documents. */
export type DriveFolderLink = {
  id: string;
  name: string;
  /** Who linked it (their Google connection gives access). */
  ownerName: string;
  ownerEmail: string;
  /** Your own link (you can unlink it); others see it read-only. */
  mine: boolean;
  available: boolean;
  createdAt: string;
};

export type DriveFolderListing = {
  link: DriveFolderLink;
  /** Path below the linked folder, top first (empty at the linked folder itself). */
  breadcrumbs: { id: string; name: string }[];
  folderId: string;
  items: DriveItem[];
};

/** Body of `POST /api/integrations/google/drive/links`. */
export const driveLinkInputSchema = z.object({
  driveFolderId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
});

/** Body of `POST /api/integrations/google/drive/links/:id/import`. `keep: "drive"` adds it as a link (bytes stay in Drive). */
export const driveImportInputSchema = z.object({
  fileId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
  folderId: idSchema.nullish(),
  keep: z.enum(["copy", "drive"]).default("copy"),
});
export type DriveImportInput = z.infer<typeof driveImportInputSchema>;

/** Body of `POST /api/integrations/google/drive/save`: copy one of the household's documents to your Drive. */
export const driveSaveInputSchema = z.object({ documentId: idSchema });

/** Query of `GET /api/integrations/google/drive/folders` (the picker for linking): `parent` = a folder id or "root". */
export const driveFolderQuerySchema = z.object({
  parent: z.string().trim().max(200).regex(/^[A-Za-z0-9_-]+$/).default("root"),
});

/** Query of `GET …/drive/links/:id/items`. */
export const driveItemsQuerySchema = z.object({
  folderId: z.string().trim().max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
});
