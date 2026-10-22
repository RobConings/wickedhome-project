import { z } from "zod";
import { readAssistantSettings, type AssistantSettings } from "@ai/core/assistant-config";
import { connectionStatusFor } from "@/api/home-assistant/ha-connection";
import { webSearchStatus, type WebSearchStatus } from "@/api/web/web.service";
import { getDriveStorageStatus, moveExistingToDrive } from "@/api/integrations/drive-storage.service";
import { listCalendarInfos, syncConnectionCalendars, updateCalendar } from "@/api/integrations/google-calendar.service";
import { getGoogleStatus, requireConnection } from "@/api/integrations/google-connection.service";
import { scanConnection } from "@/api/integrations/gmail.service";
import { badRequest, forbidden } from "@/api/lib/http";
import { GOOGLE_CALENDAR_VISIBILITIES } from "@/features/integrations/types/google";
import type { HaConnectionStatus } from "@/features/home-assistant/types/home-assistant";
import type { DriveStorageStatus } from "@/features/integrations/types/drive-storage";
import type { GoogleStatus } from "@/features/integrations/types/google";
import { fold } from "@ai/core/text-match";
import type { Locale } from "@/types/common";
import { formatDateTime } from "@/types/date-format";
import { done, registerAssistantSkill, registerAssistantTool, say } from "@ai/core/kit";
import "./mail-bills";

/**
 * Skill "integrations": the Integrations page as far as it works without a browser: the status of Google (the
 * person's own connection: calendar, Gmail bills, Drive), Drive as storage for bill documents, Home Assistant and
 * the assistant; syncing the person's own Google calendar or mailbox now; moving existing bill documents to Drive;
 * and the bill suggestions found in mail (mail-bills.ts). Connecting, reconnecting and disconnecting Google need
 * the consent screen in the browser and are never tools. No token, key or secret is ever returned.
 */

const MANAGERS = ["owner", "adult"] as const;
const EVERYONE = ["owner", "adult", "child"] as const;
const CHILD_MAIL_RULE = "Mail is not for children: only adults can use the mailbox and bills from mail.";

registerAssistantSkill({
  id: "integrations",
  title: { en: "Integrations", nl: "Integraties" },
  summary: "Google (calendar, Gmail bills, Drive), Home Assistant and assistant status; sync now; bills found in mail: accept, link or dismiss.",
  // No bare "mail": every mail question ("een mail naar Jan") then loaded these 9 tools next to the mail skill
  // (LM Studio log 2026-10-09). Only bills found in mail and the mail rules are this skill's.
  keywords: {
    nl: ["integratie", "integraties", "koppeling", "google", "gmail", "drive", "verbonden", "verbinding", "synchroniseer", "synchroniseren", "mailbox", "rekening uit mail", "facturen uit mail", "uit de mail", "negeer", "negeer de mail", "afzender toevoegen", "voorgestelde", "home assistant", "spraakherkenning", "token"],
    en: ["integration", "integrations", "google", "gmail", "drive", "connected", "connection", "sync", "synchronise", "mailbox", "bill from mail", "bills from mail", "from the mail", "add that sender", "add the sender", "suggested", "home assistant", "speech to text", "token"],
  },
});

const when = (iso: string | null | undefined, locale: Locale) => (iso ? formatDateTime(iso, locale) : null);

registerAssistantTool({
  name: "integrations.status",
  description:
    "Status of the integrations: your Google connection (calendar, Gmail bills and reading mail, sending mail from the assistant, Drive) with last sync and problems, Drive storage for bill documents, Home Assistant, the assistant (model, speech to text) and web search.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the integrations", nl: "Integraties bekeken" },
  run: async (ctx) => {
    const manager = ctx.user.role !== "child";
    const [google, ha, drive, web] = await Promise.all([
      getGoogleStatus(ctx.user),
      connectionStatusFor(ctx.householdId).catch(() => null),
      manager ? getDriveStorageStatus(ctx.user).catch(() => null) : Promise.resolve(null),
      webSearchStatus().catch(() => null),
    ]);
    return integrationsSummary({ google, ha, drive, assistant: readAssistantSettings(), web }, ctx.locale);
  },
});

type StatusParts = {
  google: GoogleStatus;
  ha: HaConnectionStatus | null;
  drive: DriveStorageStatus | null;
  assistant: AssistantSettings;
  /** Web search for the assistant (host only). */
  web?: WebSearchStatus | null;
};

/** The Integrations page in a few lines: statuses, last syncs and problems; never a token, key or URL with credentials. */
export function integrationsSummary({ google, ha, drive, assistant, web = null }: StatusParts, locale: Locale) {
  const ctx = { locale };
  const connection = google.connection;
  return {
    google: {
      // Your own connection only; the server's missing settings are named, never their values.
      status: google.status,
      serverNeeds: google.missing.length ? google.missing : null,
      account: connection?.email ?? null,
      problem: connection?.lastError ?? null,
      features: connection?.features ?? null,
      calendar: google.calendar
        ? {
            synced: google.calendar.calendars.filter((calendar) => calendar.selected).map((calendar) => `${calendar.name} (${calendar.visibility})`),
            lastSync: when(google.calendar.calendars.map((calendar) => calendar.lastSyncedAt).filter(Boolean).sort().at(-1), ctx.locale),
            problems: google.calendar.calendars.filter((calendar) => calendar.lastError).map((calendar) => `${calendar.name}: ${calendar.lastError}`),
            publishing: google.calendar.publish.calendarId ? `${google.calendar.publish.publishedCount} events, last ${when(google.calendar.publish.lastPublishedAt, ctx.locale) ?? "–"}` : "off",
          }
        : null,
      gmail: google.gmail
        ? {
            lastScan: when(google.gmail.lastScanAt, ctx.locale),
            problem: google.gmail.lastError,
            waiting: google.gmail.pendingCount,
            // The assistant reads your mail with Gmail on; sending and drafts need their own permission.
            sendFromAssistant: connection?.features.includes("gmail_send") ? "on" : "off (turn on under Google › Gmail on the Integrations page)",
          }
        : null,
      drive: google.drive ? { linkedFolders: google.drive.linkCount, storedFiles: google.drive.storedFileCount ?? null } : null,
    },
    driveStorage: drive
      ? drive.targets.map((target) => ({
          kind: target.kind,
          state: target.state,
          paused: target.pausedReason,
          folder: target.folder?.name ?? null,
          owner: target.owner?.name ?? null,
          files: `${target.counts.inDrive} in Drive, ${target.counts.local} on the server, ${target.counts.pending} waiting${target.counts.failed ? `, ${target.counts.failed} failing` : ""}`,
          problem: target.lastError,
        }))
      : null,
    homeAssistant: ha ? { state: ha.state, version: ha.haVersion, entities: ha.entityCount || null, problem: ha.errorCode } : null,
    // Host and model only: never the API key.
    assistant: { configured: assistant.problem === null, problem: assistant.problem, model: assistant.model, speechToText: assistant.sttUrl !== null },
    webSearch: web ? { configured: web.configured, ok: web.ok, host: web.host, problem: web.problem } : null,
    note: "Connecting or disconnecting Google happens on the Integrations page in the browser.",
  };
}

registerAssistantTool({
  name: "integrations.sync",
  description: "Sync your own Google calendars now (calendar), or search your own Gmail for new bills now (mail, adults only). Needs that Google feature to be connected. Never reads mails aloud.",
  input: z.object({ what: z.enum(["calendar", "mail"]) }),
  permission: "write",
  confirm: "first-time",
  roles: EVERYONE,
  // As in the app: mail (bills from mail) is for owners and adults; children only sync their calendar.
  refuse: (ctx, input) => (input.what === "mail" && ctx.user.role === "child" ? CHILD_MAIL_RULE : null),
  activity: { en: "Synced with Google", nl: "Met Google gesynchroniseerd" },
  describe: (ctx, input) =>
    input.what === "calendar" ? say(ctx.locale, "Sync your Google calendars now", "Je Google-agenda's nu synchroniseren") : say(ctx.locale, "Search your Gmail for bills now", "Je Gmail nu doorzoeken naar rekeningen"),
  run: async (ctx, input) => {
    if (input.what === "calendar") {
      const connection = await requireConnection(ctx.user, "calendar");
      const { failed } = await syncConnectionCalendars(connection.id, { signal: ctx.signal });
      return done(failed ? `Synced your Google calendars; ${failed} had a problem (see integrations_status).` : "Synced your Google calendars.");
    }
    if (ctx.user.role === "child") throw forbidden(CHILD_MAIL_RULE);
    const connection = await requireConnection(ctx.user, "gmail");
    const added = await scanConnection(connection.id, { signal: ctx.signal });
    return done(`Searched your mailbox: ${added} new bill suggestion(s).`);
  },
});

registerAssistantTool({
  name: "integrations.move_to_drive",
  description: "Move the bill documents still stored on the server to the household's Google Drive folder (only when Drive storage is set up and active). Runs in the background.",
  input: z.object({}),
  permission: "write",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Moved bill documents to Drive", nl: "Factuurdocumenten naar Drive verplaatst" },
  describe: (ctx) => say(ctx.locale, "Move the bill documents on the server to Google Drive", "De factuurdocumenten op de server naar Google Drive verplaatsen"),
  preview: async (ctx) => {
    const status = await getDriveStorageStatus(ctx.user);
    const bills = status.targets.find((target) => target.kind === "bills");
    if (!bills) return null;
    return {
      kind: "fields",
      data: {
        fields: [
          { label: say(ctx.locale, "Folder", "Map"), value: bills.folder?.name ?? "–" },
          { label: say(ctx.locale, "To move", "Te verplaatsen"), value: String(bills.counts.local) },
          { label: say(ctx.locale, "Already in Drive", "Al in Drive"), value: String(bills.counts.inDrive) },
        ],
      },
    };
  },
  run: async (ctx) => {
    const { queued } = await moveExistingToDrive(ctx.user, "bills");
    return done(queued ? `${queued} bill document(s) will move to Drive in the background.` : "Nothing to move: every bill document is already in Drive.");
  },
});

registerAssistantTool({
  name: "integrations.set_calendar",
  description: "For one of your own Google calendars: sync it into the app or stop (sync), and who sees its events (household or private).",
  input: z.object({
    calendar: z.string().trim().min(1).max(100).describe("Name of your Google calendar, e.g. 'Werk'"),
    sync: z.boolean().optional().describe("true: show its events in the app; false: stop (forgets them)"),
    visibility: z.enum(GOOGLE_CALENDAR_VISIBILITIES).optional().describe("household: everyone sees its events; private: only you"),
  }),
  permission: "write",
  confirm: "always",
  roles: EVERYONE,
  activity: { en: "Changed a Google calendar", nl: "Google-agenda aangepast" },
  describe: (ctx, input) => {
    const parts = [input.sync === undefined ? null : input.sync ? say(ctx.locale, "sync it", "synchroniseren") : say(ctx.locale, "stop syncing", "niet meer synchroniseren"), input.visibility ?? null].filter(Boolean);
    return say(ctx.locale, `Google calendar “${input.calendar}”: ${parts.join(", ")}`, `Google-agenda “${input.calendar}”: ${parts.join(", ")}`);
  },
  run: async (ctx, input) => {
    if (input.sync === undefined && !input.visibility) throw badRequest("Say whether to sync it, or who sees it.");
    const connection = await requireConnection(ctx.user, "calendar");
    const calendars = await listCalendarInfos(connection.id);
    const wanted = fold(input.calendar);
    const matches = calendars.filter((calendar) => fold(calendar.name) === wanted);
    const found = matches.length ? matches : calendars.filter((calendar) => fold(calendar.name).includes(wanted));
    const target = found.length === 1 ? found[0] : undefined;
    if (!target) return { error: `${found.length ? "Which one" : "No calendar matches"}: ${(found.length ? found : calendars).map((calendar) => calendar.name).join(", ")}.` };
    const saved = await updateCalendar(connection, target.id, { selected: input.sync, visibility: input.visibility });
    return done(`“${saved.name}”: ${saved.selected ? `synced, ${saved.visibility}` : "not synced"}.`);
  },
});
