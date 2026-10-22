import type { GoogleClient } from "@/features/integrations/data/google-client";
import type {
  DriveFolderLink,
  DriveFolderListing,
  DriveItem,
  GoogleCalendarInfo,
  GoogleStatus,
  MailBillRule,
  MailBillSuggestion,
} from "@/features/integrations/types/google";
import type { MailLinkMatch, MailLinkOptions, MailLinkRecurring, MailLinkTarget, MailOccurrenceOptions } from "@/features/integrations/types/mail-matching";

export { expenseHabitants, expenseShops, expensesToday, payeeFixtures } from "../expenses/fixtures";

const base = {
  missing: [],
  redirectUri: "https://home.example.be/api/integrations/google/callback",
  // Stories run on the Storybook origin: connecting would show the "open WickedHome at…" hint.
  connectOrigin: typeof window === "undefined" ? "https://home.example.be" : window.location.origin,
};

export const notConfiguredGoogleFixture: GoogleStatus = {
  ...base,
  status: "not_configured",
  missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "INTEGRATIONS_KEY"],
  connection: null,
  calendar: null,
  gmail: null,
  drive: null,
};

export const disconnectedGoogleFixture: GoogleStatus = { ...base, status: "disconnected", connection: null, calendar: null, gmail: null, drive: null };

export const googleCalendarsFixture: GoogleCalendarInfo[] = [
  { id: "cal1", name: "Rob", color: "#9fe1e7", primary: true, canWrite: true, selected: true, visibility: "household", eventCount: 42, lastSyncedAt: "2026-10-03T08:45:00Z", lastError: null },
  { id: "cal2", name: "Werk (ITP)", color: "#f83a22", primary: false, canWrite: false, selected: true, visibility: "private", eventCount: 18, lastSyncedAt: "2026-10-03T08:45:00Z", lastError: null },
  { id: "cal3", name: "Feestdagen in België", color: "#16a765", primary: false, canWrite: false, selected: false, visibility: "household", eventCount: 0, lastSyncedAt: null, lastError: null },
  { id: "cal4", name: "Gezin", color: "#cd74e6", primary: false, canWrite: true, selected: false, visibility: "household", eventCount: 0, lastSyncedAt: null, lastError: null },
];

export const connectedGoogleFixture: GoogleStatus = {
  ...base,
  status: "connected",
  connection: {
    email: "rob@gmail.com",
    status: "connected",
    lastError: null,
    connectedAt: "2026-09-20T18:12:00Z",
    features: ["calendar", "calendar_publish", "gmail", "drive"],
  },
  calendar: {
    calendars: googleCalendarsFixture,
    publish: { calendarId: "cal4", categories: ["family", "holiday"], publishedCount: 12, lastPublishedAt: "2026-10-03T08:45:00Z", lastError: null },
  },
  gmail: { lastScanAt: "2026-10-03T08:40:00Z", lastError: null, pendingCount: 2 },
  drive: { linkCount: 1 },
};

/** Only Calendar turned on: Gmail and Drive offer "Turn on" (incremental consent). */
export const calendarOnlyGoogleFixture: GoogleStatus = {
  ...connectedGoogleFixture,
  connection: { ...connectedGoogleFixture.connection!, features: ["calendar"] },
  calendar: { calendars: googleCalendarsFixture, publish: { calendarId: null, categories: [], publishedCount: 0, lastPublishedAt: null, lastError: null } },
  gmail: null,
  drive: null,
};

export const needsReconnectGoogleFixture: GoogleStatus = {
  ...connectedGoogleFixture,
  status: "error",
  connection: { ...connectedGoogleFixture.connection!, status: "needs_reconnect", lastError: "Google no longer accepts this connection" },
};

export const mailRulesFixture: MailBillRule[] = [
  { id: "r1", payee: "Fluvius", senders: ["fluvius.be"], category: "energy", enabled: true, builtIn: true, recurringExpenseId: null },
  { id: "r2", payee: "Luminus", senders: ["luminus.be"], category: "energy", enabled: true, builtIn: true, recurringExpenseId: "rec-luminus" },
  { id: "r3", payee: "Telenet", senders: ["telenet.be"], category: "internet_phone", enabled: true, builtIn: true, recurringExpenseId: null },
  { id: "r4", payee: "De Watergroep", senders: ["dewatergroep.be"], category: "water", enabled: false, builtIn: true, recurringExpenseId: null },
  { id: "r5", payee: "Gemeente Lier", senders: ["facturen@lier.be"], category: "taxes", enabled: true, builtIn: false, recurringExpenseId: null },
];

// ── Linking a mail to an existing expense ────────────────────────────────────────────────────────────

const linkTarget = (overrides: Partial<MailLinkTarget>): MailLinkTarget => ({
  expenseId: "e1",
  recurringExpenseId: null,
  payee: "Fluvius",
  category: "energy",
  kind: null,
  dueDate: "2026-10-20",
  amountCents: 10900,
  paidOn: null,
  structuredCommunication: null,
  reference: null,
  iban: null,
  beneficiaryName: null,
  ...overrides,
});

/** Fluvius one-off, close amount (variable bill) and date: strong. */
export const fluviusMatchFixture: MailLinkMatch = { ...linkTarget({ expenseId: "e-fluvius", reference: "Afrekening 2026" }), score: 78, reasons: ["payee", "date", "amount_close"], strong: true };
/** Luminus: an instance of the remembered recurring expense. */
export const luminusMatchFixture: MailLinkMatch = {
  ...linkTarget({
    expenseId: "e-luminus-oct",
    recurringExpenseId: "rec-luminus",
    payee: "Luminus energie",
    kind: "utility",
    dueDate: "2026-10-22",
    amountCents: 22500,
    iban: "BE71096123456769",
    beneficiaryName: "Luminus",
  }),
  score: 133,
  reasons: ["payee", "remembered", "date"],
  strong: true,
};
/** De Watergroep: same payee, but the amount is far off: only "Maybe". */
export const watergroepMatchFixture: MailLinkMatch = {
  ...linkTarget({ expenseId: "e-water", payee: "De Watergroep", category: "water", dueDate: "2026-10-31", amountCents: 6200 }),
  score: 46,
  reasons: ["payee", "date"],
  strong: false,
};
/** A paid expense picked from the search (the diff warns before changing what was paid). */
export const paidTargetFixture: MailLinkTarget = linkTarget({ expenseId: "e-paid", dueDate: "2026-10-05", amountCents: 11000, paidOn: "2026-10-03" });

export const linkRecurringFixture: MailLinkRecurring[] = [
  { id: "rec-luminus", payee: "Luminus energie", category: "energy", kind: "utility", status: "active", amountCents: 22500, rrule: "FREQ=MONTHLY", nextDueDate: "2026-10-22", structuredCommunication: null, iban: "BE71096123456769", beneficiaryName: "Luminus" },
  { id: "rec-telenet", payee: "Telenet", category: "internet_phone", kind: "subscription", status: "active", amountCents: 6900, rrule: "FREQ=MONTHLY", nextDueDate: "2026-10-12", structuredCommunication: null, iban: null, beneficiaryName: null },
  { id: "rec-water", payee: "De Watergroep", category: "water", kind: "utility", status: "active", amountCents: 4800, rrule: "FREQ=MONTHLY;INTERVAL=3", nextDueDate: "2026-11-01", structuredCommunication: null, iban: null, beneficiaryName: null },
  { id: "rec-gym", payee: "Basic-Fit", category: "leisure", kind: "subscription", status: "paused", amountCents: 2999, rrule: "FREQ=MONTHLY", nextDueDate: null, structuredCommunication: null, iban: null, beneficiaryName: null },
];

export const linkOptionsFixture: MailLinkOptions = {
  matches: [fluviusMatchFixture, watergroepMatchFixture],
  expenses: [
    fluviusMatchFixture,
    luminusMatchFixture,
    watergroepMatchFixture,
    paidTargetFixture,
    linkTarget({ expenseId: "e-telenet", recurringExpenseId: "rec-telenet", payee: "Telenet", category: "internet_phone", kind: "subscription", dueDate: "2026-10-12", amountCents: 6900 }),
    linkTarget({ expenseId: "e-lier", payee: "Gemeente Lier", category: "taxes", dueDate: "2026-09-15", amountCents: 12000, paidOn: "2026-09-10" }),
  ],
  recurring: linkRecurringFixture,
  rememberedRecurringId: "rec-luminus",
};

/** De Watergroep (quarterly): the occurrence for the mail lies beyond the generated horizon, so it doesn't exist yet. */
export const occurrencesFixture: MailOccurrenceOptions = {
  occurrences: [
    linkTarget({ expenseId: "w-may", recurringExpenseId: "rec-water", payee: "De Watergroep", category: "water", kind: "utility", dueDate: "2027-08-01", amountCents: 4800, paidOn: null }),
    linkTarget({ expenseId: null, recurringExpenseId: "rec-water", payee: "De Watergroep", category: "water", kind: "utility", dueDate: "2027-11-01", amountCents: 4800 }),
    linkTarget({ expenseId: null, recurringExpenseId: "rec-water", payee: "De Watergroep", category: "water", kind: "utility", dueDate: "2028-02-01", amountCents: 4800 }),
  ],
  suggested: "2027-11-01",
};

export const mailSuggestionsFixture: MailBillSuggestion[] = [
  {
    id: "s1",
    payee: "Fluvius",
    category: "energy",
    subject: "Je factuur van oktober",
    receivedAt: "2026-10-02T08:00:00Z",
    amountCents: 11235,
    dueDate: "2026-10-25",
    structuredCommunication: "012345678939",
    iban: "BE68539007547034",
    attachmentName: "Factuur_2026_10.pdf",
    mailboxOwner: "Rob",
    status: "pending",
    matches: [fluviusMatchFixture],
    rememberedRecurringId: null,
  },
  {
    id: "s2",
    payee: "Telenet",
    category: "internet_phone",
    subject: "Je Telenet-factuur",
    receivedAt: "2026-09-29T06:30:00Z",
    amountCents: null,
    dueDate: null,
    structuredCommunication: null,
    iban: null,
    attachmentName: "factuur.pdf",
    mailboxOwner: "Clara",
    status: "pending",
    matches: [],
    rememberedRecurringId: null,
  },
  {
    id: "s3",
    payee: "De Watergroep",
    category: "water",
    subject: "Tussentijdse factuur",
    receivedAt: "2026-09-25T10:00:00Z",
    amountCents: 4800,
    dueDate: "2026-10-15",
    structuredCommunication: null,
    iban: null,
    attachmentName: "tussentijdse-factuur.pdf",
    mailboxOwner: "Rob",
    status: "pending",
    matches: [watergroepMatchFixture],
    rememberedRecurringId: null,
  },
  {
    id: "s4",
    payee: "Luminus",
    category: "energy",
    subject: "Voorschotfactuur",
    receivedAt: "2026-09-20T10:00:00Z",
    amountCents: 23950,
    dueDate: "2026-10-22",
    structuredCommunication: "090123456701",
    iban: "BE71096123456769",
    attachmentName: null,
    mailboxOwner: "Clara",
    status: "pending",
    // The sender is remembered: pre-matched to this month's Luminus payment.
    matches: [luminusMatchFixture],
    rememberedRecurringId: "rec-luminus",
  },
];

export const driveFoldersFixture: DriveItem[] = [
  { id: "f1", name: "Huis", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: null, webUrl: null, downloadable: false, linkable: false },
  { id: "f2", name: "Auto", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: null, webUrl: null, downloadable: false, linkable: false },
  { id: "f3", name: "School", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: null, webUrl: null, downloadable: false, linkable: false },
];

export const driveLinkFixture: DriveFolderLink = {
  id: "l1",
  name: "Huis",
  ownerName: "Rob",
  ownerEmail: "rob@gmail.com",
  mine: true,
  available: true,
  createdAt: "2026-09-21T10:00:00Z",
};

export const driveLinksFixture: DriveFolderLink[] = [
  driveLinkFixture,
  { ...driveLinkFixture, id: "l2", name: "Recepten", ownerName: "Clara", ownerEmail: "clara@gmail.com", mine: false },
  { ...driveLinkFixture, id: "l3", name: "Oude scans", ownerName: "Clara", ownerEmail: "clara@gmail.com", mine: false, available: false },
];

export const driveListingFixture: DriveFolderListing = {
  link: driveLinkFixture,
  breadcrumbs: [],
  folderId: "f1",
  items: [
    { id: "a", name: "Verbouwing", mimeType: "application/vnd.google-apps.folder", isFolder: true, sizeBytes: null, modifiedAt: "2026-08-01T10:00:00Z", webUrl: "https://drive.google.com/drive/folders/a", downloadable: false, linkable: false },
    { id: "b", name: "Notariële akte.pdf", mimeType: "application/pdf", isFolder: false, sizeBytes: 2_400_000, modifiedAt: "2025-04-12T10:00:00Z", webUrl: "https://drive.google.com/file/d/b/view", downloadable: true, linkable: true },
    { id: "c", name: "Energieprestatiecertificaat.jpg", mimeType: "image/jpeg", isFolder: false, sizeBytes: 840_000, modifiedAt: "2024-11-02T10:00:00Z", webUrl: "https://drive.google.com/file/d/c/view", downloadable: true, linkable: true },
    { id: "d", name: "Budget verbouwing", mimeType: "application/pdf", isFolder: false, sizeBytes: null, modifiedAt: "2026-09-30T10:00:00Z", webUrl: "https://docs.google.com/spreadsheets/d/d", downloadable: true, linkable: false },
    { id: "e", name: "Enquête", mimeType: "application/vnd.google-apps.form", isFolder: false, sizeBytes: null, modifiedAt: "2026-02-01T10:00:00Z", webUrl: "https://docs.google.com/forms/d/e", downloadable: false, linkable: false },
  ],
};

const wait = <T,>(value: T, ms = 600) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const never = <T,>() => new Promise<T>(() => undefined);

/** A pretend API for the stories: answers after a short delay, or never (`hang`), or fails (`fail`). */
export function fakeGoogleClient(status: GoogleStatus, options: { hang?: boolean; fail?: boolean; suggestions?: MailBillSuggestion[] } = {}): GoogleClient {
  const answer = <T,>(value: T) => (options.hang ? never<T>() : options.fail ? wait(value).then(() => Promise.reject(new Error("fake failure"))) : wait(value));
  return {
    status: () => answer(status),
    start: () => never(),
    finish: () => answer(connectedGoogleFixture),
    disconnect: () => answer(disconnectedGoogleFixture),
    refreshCalendars: () => answer(googleCalendarsFixture),
    updateCalendar: (id, update) => answer({ ...googleCalendarsFixture.find((calendar) => calendar.id === id)!, ...update }),
    syncCalendars: () => answer(status),
    savePublish: () => answer(status),
    scanMail: () => answer(status),
    suggestions: () => answer({ suggestions: options.suggestions ?? mailSuggestionsFixture }),
    suggestionText: () =>
      answer({
        text: "Geachte,\n\nGelieve in bijlage de factuur te vinden voor de verrichte werkzaamheden.\n\nMet vriendelijke groet,\nHuybrechts BV",
        hasPdf: true,
      }),
    dismissSuggestion: () => answer(undefined),
    acceptSuggestion: () => answer({ attached: true }),
    linkOptions: () => answer(linkOptionsFixture),
    occurrences: () => answer(occurrencesFixture),
    linkSuggestion: (_id, input) =>
      answer({
        expenseId: "expenseId" in input.target ? input.target.expenseId : "created",
        created: !("expenseId" in input.target),
        attached: true,
        updated: input.apply,
        alreadyLinked: false,
      }),
    mailOrigins: () => answer({ origins: [] }),
    rules: () => answer(mailRulesFixture),
    createRule: (input) => answer({ id: "new", builtIn: false, recurringExpenseId: null, ...input }),
    updateRule: (id, input) =>
      answer({ id, builtIn: mailRulesFixture.find((rule) => rule.id === id)?.builtIn ?? false, recurringExpenseId: null, ...input }),
    deleteRule: () => answer(undefined),
    driveLinks: () => answer(driveLinksFixture),
    driveFolders: () => answer(driveFoldersFixture),
    linkDriveFolder: () => answer(driveLinkFixture),
    unlinkDriveFolder: () => answer(undefined),
    driveListing: () => answer(driveListingFixture),
    importDriveFile: () => answer({ documentId: "doc1" }),
    saveToDrive: () => answer({ webUrl: "https://drive.google.com/file/d/x/view" }),
  };
}
