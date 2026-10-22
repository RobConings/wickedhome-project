import { pipeline } from "node:stream/promises";
import { Router, type Request } from "express";
import {
  driveFolderQuerySchema,
  driveImportInputSchema,
  driveItemsQuerySchema,
  driveLinkInputSchema,
  driveSaveInputSchema,
  googleCalendarUpdateSchema,
  googlePublishInputSchema,
  googleStartInputSchema,
  mailBillRuleInputSchema,
  mailSuggestionAcceptSchema,
} from "@/features/integrations/types/google";
import { mailLinkInputSchema, mailOccurrenceQuerySchema, mailOriginsQuerySchema } from "@/features/integrations/types/mail-matching";
import { idSchema } from "@/types/common";
import { registerCalendarSource, registerCalendarWriter } from "../calendar/calendar-sources";
import { contentDisposition } from "../documents/documents-http";
import { conflict, forbidden, parse } from "../lib/http";
import { currentSessionId, currentUser, requireRole, requireUser } from "../lib/session";
import { listCalendarInfos, refreshCalendarList, setPublishSettings, syncConnectionCalendars, updateCalendar } from "./google-calendar.service";
import { googleCalendarSource } from "./google-calendar.source";
import { googleCalendarWriter } from "./google-calendar.writer";
import {
  disconnectGoogle,
  finishGoogleAuthorization,
  getGoogleStatus,
  receiveGoogleCallback,
  requireConnection,
  startGoogleAuthorization,
} from "./google-connection.service";
import {
  importLinkedFile,
  linkFolder,
  listDriveLinks,
  listLinkedFolder,
  listOwnFolders,
  openLinkedFile,
  saveToDrive,
  unlinkFolder,
} from "./google-drive.service";
import {
  acceptSuggestion,
  createRule,
  deleteRule,
  dismissSuggestion,
  getLinkOptions,
  getSuggestionMail,
  getSuggestionPdf,
  getOccurrenceOptions,
  linkSuggestion,
  listMailOrigins,
  listPendingSuggestions,
  listRules,
  scanConnection,
  updateRule,
} from "./gmail.service";
import "./integrations.jobs";
// Household events pushed to Google Calendar a few seconds after they change.
import "./google-calendar-push";
import { driveStorageRouter } from "./drive-storage.routes";

registerCalendarSource(googleCalendarSource);
registerCalendarWriter(googleCalendarWriter);

/**
 * `/api/integrations/*`. Google is per person: every route works on the signed-in person's own connection,
 * except the household-wide mail suggestions/rules and the linked Drive folders (household-scoped).
 */
export const integrationsRouter = Router();

/**
 * Google sends the browser here after the consent screen. Public on purpose: the SameSite=Strict session
 * cookie isn't sent on this cross-site navigation. It only parks the code on its state row; the session that
 * started the round finishes it from /integrations (POST /google/finish).
 */
integrationsRouter.get("/google/callback", async (req, res) => {
  const target = await receiveGoogleCallback(req.query);
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).redirect(303, target);
});

integrationsRouter.use(requireUser);
// Drive as storage for bill documents (household setting): drive-storage.routes.ts.
integrationsRouter.use(driveStorageRouter);

const canManage = requireRole("owner", "adult");
const sessionOf = (req: Request) => {
  const id = currentSessionId(req);
  if (!id) throw conflict("No session");
  return id;
};

// ── Connection ──────────────────────────────────────────────────────────────────────────────────────

integrationsRouter.get("/google", async (req, res) => {
  res.json(await getGoogleStatus(currentUser(req)));
});

integrationsRouter.post("/google/start", async (req, res) => {
  const { features } = parse(googleStartInputSchema, req.body);
  const user = currentUser(req);
  // Bills and Drive links end up with the adults (expenses, documents); children connect their calendar only.
  // Mail (reading and sending through the assistant) is for owners and adults too.
  if (user.role === "child" && features.some((feature) => feature === "gmail" || feature === "gmail_send" || feature === "drive" || feature === "drive_full")) throw forbidden();
  res.json({ url: await startGoogleAuthorization(user, sessionOf(req), features) });
});

integrationsRouter.post("/google/finish", async (req, res) => {
  res.json(await finishGoogleAuthorization(currentUser(req), currentSessionId(req)));
});

integrationsRouter.post("/google/disconnect", async (req, res) => {
  res.json(await disconnectGoogle(currentUser(req)));
});

// ── Calendar ────────────────────────────────────────────────────────────────────────────────────────

integrationsRouter.post("/google/calendars/refresh", async (req, res) => {
  const connection = await requireConnection(currentUser(req), "calendar");
  await refreshCalendarList(connection);
  res.json(await listCalendarInfos(connection.id));
});

integrationsRouter.patch("/google/calendars/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const update = parse(googleCalendarUpdateSchema, req.body);
  const connection = await requireConnection(currentUser(req), "calendar");
  res.json(await updateCalendar(connection, id, update));
});

integrationsRouter.post("/google/calendar/sync", async (req, res) => {
  const user = currentUser(req);
  const connection = await requireConnection(user, "calendar");
  await syncConnectionCalendars(connection.id);
  res.json(await getGoogleStatus(user));
});

integrationsRouter.put("/google/calendar/publish", async (req, res) => {
  const user = currentUser(req);
  const input = parse(googlePublishInputSchema, req.body);
  const connection = await requireConnection(user, "calendar");
  await setPublishSettings(connection, input);
  // Publish right away (also removes everything when it was turned off); problems show on the card.
  await syncConnectionCalendars(connection.id);
  res.json(await getGoogleStatus(user));
});

// ── Gmail bill suggestions ──────────────────────────────────────────────────────────────────────────

integrationsRouter.post("/google/mail/scan", async (req, res) => {
  const user = currentUser(req);
  const connection = await requireConnection(user, "gmail");
  await scanConnection(connection.id);
  res.json(await getGoogleStatus(user));
});

integrationsRouter.get("/google/mail/suggestions", canManage, async (req, res) => {
  res.json({ suggestions: await listPendingSuggestions(currentUser(req).householdId) });
});

integrationsRouter.post("/google/mail/suggestions/:id/dismiss", canManage, async (req, res) => {
  await dismissSuggestion(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

integrationsRouter.post("/google/mail/suggestions/:id/accept", canManage, async (req, res) => {
  const { expenseId } = parse(mailSuggestionAcceptSchema, req.body);
  res.json(await acceptSuggestion(currentUser(req), parse(idSchema, req.params.id), expenseId));
});

/** The mail of a suggestion (sender, subject, date, plain-text body), to check it before accepting. */
integrationsRouter.get("/google/mail/suggestions/:id/mail", canManage, async (req, res) => {
  res.json(await getSuggestionMail(currentUser(req).householdId, parse(idSchema, req.params.id)));
});

/** The suggestion's PDF from the mailbox, inline (the preview's frame, or a new tab). */
integrationsRouter.get("/google/mail/suggestions/:id/pdf", canManage, async (req, res) => {
  const { bytes, name } = await getSuggestionPdf(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(bytes.length),
    "Content-Disposition": contentDisposition(name, "application/pdf", false),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(bytes);
});

/** The link dialog: ranked matches, expenses to search, recurring expenses. */
integrationsRouter.get("/google/mail/suggestions/:id/link-options", canManage, async (req, res) => {
  res.json(await getLinkOptions(currentUser(req).householdId, parse(idSchema, req.params.id)));
});

/** A recurring expense's occurrences around the mail, with the one the app picks. */
integrationsRouter.get("/google/mail/suggestions/:id/occurrences", canManage, async (req, res) => {
  const { recurringExpenseId } = parse(mailOccurrenceQuerySchema, req.query);
  res.json(await getOccurrenceOptions(currentUser(req).householdId, parse(idSchema, req.params.id), recurringExpenseId));
});

/** Link the mail to an existing expense or a recurring expense's occurrence (created when needed). */
integrationsRouter.post("/google/mail/suggestions/:id/link", canManage, async (req, res) => {
  const input = parse(mailLinkInputSchema, req.body);
  res.json(await linkSuggestion(currentUser(req), parse(idSchema, req.params.id), input));
});

/** "From mail on …" next to an expense's attachments (anyone who can see the expense). */
integrationsRouter.get("/google/mail/origins", async (req, res) => {
  const { expenseId } = parse(mailOriginsQuerySchema, req.query);
  res.json({ origins: await listMailOrigins(currentUser(req).householdId, expenseId) });
});

integrationsRouter.get("/google/mail/rules", canManage, async (req, res) => {
  res.json(await listRules(currentUser(req).householdId));
});

integrationsRouter.post("/google/mail/rules", canManage, async (req, res) => {
  res.status(201).json(await createRule(currentUser(req).householdId, parse(mailBillRuleInputSchema, req.body)));
});

integrationsRouter.put("/google/mail/rules/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await updateRule(currentUser(req).householdId, id, parse(mailBillRuleInputSchema, req.body)));
});

integrationsRouter.delete("/google/mail/rules/:id", canManage, async (req, res) => {
  await deleteRule(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

// ── Drive ───────────────────────────────────────────────────────────────────────────────────────────

integrationsRouter.get("/google/drive/links", async (req, res) => {
  res.json(await listDriveLinks(currentUser(req)));
});

integrationsRouter.get("/google/drive/folders", canManage, async (req, res) => {
  const { parent } = parse(driveFolderQuerySchema, req.query);
  const connection = await requireConnection(currentUser(req), "drive");
  res.json(await listOwnFolders(connection, parent));
});

integrationsRouter.post("/google/drive/links", canManage, async (req, res) => {
  const user = currentUser(req);
  const { driveFolderId } = parse(driveLinkInputSchema, req.body);
  const connection = await requireConnection(user, "drive");
  res.status(201).json(await linkFolder(user, connection, driveFolderId));
});

integrationsRouter.delete("/google/drive/links/:id", canManage, async (req, res) => {
  await unlinkFolder(currentUser(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

integrationsRouter.get("/google/drive/links/:id/items", async (req, res) => {
  const { folderId } = parse(driveItemsQuerySchema, req.query);
  res.json(await listLinkedFolder(currentUser(req), parse(idSchema, req.params.id), folderId));
});

/** A file of a linked folder, streamed through the server with the same safety headers as documents. */
integrationsRouter.get("/google/drive/links/:id/files/:fileId/content", async (req, res) => {
  const fileId = parse(driveItemsQuerySchema.shape.folderId.unwrap(), req.params.fileId);
  const { item, stream, sizeBytes } = await openLinkedFile(currentUser(req), parse(idSchema, req.params.id), fileId);
  const forceDownload = req.query.download === "1";
  const name = item.mimeType === "application/pdf" && !/\.pdf$/i.test(item.name) ? `${item.name}.pdf` : item.name;
  res.set({
    "Content-Type": item.mimeType,
    "Content-Disposition": contentDisposition(name, item.mimeType, forceDownload),
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
    ...(sizeBytes !== null && { "Content-Length": String(sizeBytes) }),
  });
  if (!(item.mimeType === "application/pdf" && !forceDownload)) {
    res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
  await pipeline(stream, res).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") throw error;
  });
});

integrationsRouter.post("/google/drive/links/:id/import", canManage, async (req, res) => {
  const input = parse(driveImportInputSchema, req.body);
  res.status(201).json(await importLinkedFile(currentUser(req), parse(idSchema, req.params.id), input));
});

integrationsRouter.post("/google/drive/save", canManage, async (req, res) => {
  const user = currentUser(req);
  const { documentId } = parse(driveSaveInputSchema, req.body);
  const connection = await requireConnection(user, "drive");
  res.json(await saveToDrive(user, connection, documentId));
});
