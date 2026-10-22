import { api, resourcePath, withQuery } from "@/lib/api-client";
import type {
  DriveFolderLink,
  DriveFolderListing,
  DriveImportInput,
  DriveItem,
  GoogleCalendarInfo,
  GoogleCalendarUpdate,
  GoogleFeature,
  GooglePublishInput,
  GoogleStatus,
  MailBillRule,
  MailBillRuleInput,
  MailBillSuggestionMail,
  MailSuggestionList,
} from "../types/google";
import type { MailDocumentOrigin, MailLinkInput, MailLinkOptions, MailLinkResult, MailOccurrenceOptions } from "../types/mail-matching";

const base = "/integrations/google";
const calendarPath = resourcePath(`${base}/calendars`);
const suggestionPath = resourcePath(`${base}/mail/suggestions`);
const rulePath = resourcePath(`${base}/mail/rules`);
const driveLinkPath = resourcePath(`${base}/drive/links`);

/** Everything the Google card shows for the signed-in person. Loader-friendly. */
export const fetchGoogleStatus = () => api.get<GoogleStatus>(base);

/** Starts a consent round; the browser then goes to the returned Google URL. */
export const startGoogleConnect = (features: GoogleFeature[]) => api.post<{ url: string }>(`${base}/start`, { features });
/** Completes the round after Google sent the person back (`/integrations?google=finish`). */
export const finishGoogleConnect = () => api.post<GoogleStatus>(`${base}/finish`);
export const disconnectGoogle = () => api.post<GoogleStatus>(`${base}/disconnect`);

export const refreshGoogleCalendars = () => api.post<GoogleCalendarInfo[]>(`${base}/calendars/refresh`);
export const updateGoogleCalendar = (id: string, update: GoogleCalendarUpdate) =>
  api.patch<GoogleCalendarInfo>(calendarPath(id), update);
export const syncGoogleCalendars = () => api.post<GoogleStatus>(`${base}/calendar/sync`);
export const saveGooglePublish = (input: GooglePublishInput) => api.put<GoogleStatus>(`${base}/calendar/publish`, input);

export const scanGoogleMail = () => api.post<GoogleStatus>(`${base}/mail/scan`);
export const fetchMailSuggestions = () => api.get<MailSuggestionList>(`${base}/mail/suggestions`);
/** The text of a suggestion's mail (to check before accepting). */
export const fetchMailSuggestionText = (id: string) => api.get<MailBillSuggestionMail>(suggestionPath(id, "mail"));
export const dismissMailSuggestion = (id: string) => api.post(suggestionPath(id, "dismiss"));
export const acceptMailSuggestion = (id: string, expenseId: string) =>
  api.post<{ attached: boolean }>(suggestionPath(id, "accept"), { expenseId });
/** The link dialog: ranked matches, expenses to search, recurring expenses. */
export const fetchMailLinkOptions = (id: string) => api.get<MailLinkOptions>(suggestionPath(id, "link-options"));
/** Occurrences of one recurring expense around the mail, with the one the app picks. */
export const fetchMailOccurrences = (id: string, recurringExpenseId: string) =>
  api.get<MailOccurrenceOptions>(withQuery(suggestionPath(id, "occurrences"), { recurringExpenseId }));
export const linkMailSuggestion = (id: string, input: MailLinkInput) => api.post<MailLinkResult>(suggestionPath(id, "link"), input);
/** Which of an expense's documents came from a mail ("From mail on …"). */
export const fetchMailOrigins = (expenseId: string) =>
  api.get<{ origins: MailDocumentOrigin[] }>(withQuery(`${base}/mail/origins`, { expenseId }));
export const fetchMailRules = () => api.get<MailBillRule[]>(`${base}/mail/rules`);
export const createMailRule = (input: MailBillRuleInput) => api.post<MailBillRule>(`${base}/mail/rules`, input);
export const updateMailRule = (id: string, input: MailBillRuleInput) => api.put<MailBillRule>(rulePath(id), input);
export const deleteMailRule = (id: string) => api.delete(rulePath(id));

export const fetchDriveLinks = () => api.get<DriveFolderLink[]>(`${base}/drive/links`);
export const fetchDriveFolders = (parent = "root") => api.get<DriveItem[]>(withQuery(`${base}/drive/folders`, { parent }));
export const linkDriveFolder = (driveFolderId: string) => api.post<DriveFolderLink>(`${base}/drive/links`, { driveFolderId });
export const unlinkDriveFolder = (id: string) => api.delete(driveLinkPath(id));
export const fetchDriveListing = (linkId: string, folderId?: string) =>
  api.get<DriveFolderListing>(
    withQuery(driveLinkPath(linkId, "items"), { folderId }),
  );
export const importDriveFile = (linkId: string, input: DriveImportInput) =>
  api.post<{ documentId: string }>(driveLinkPath(linkId, "import"), input);
export const saveDocumentToDrive = (documentId: string) => api.post<{ webUrl: string | null }>(`${base}/drive/save`, { documentId });

/** Opens (or with `download`, downloads) a file of a linked Drive folder through the server. */
export const driveFileUrl = (linkId: string, fileId: string, { download = false } = {}) =>
  `/api${withQuery(driveLinkPath(linkId, "files", fileId, "content"), { download: download ? 1 : undefined })}`;
