import { z } from "zod";
import { listAuditEntries } from "@/api/audit/audit.service";
import { updateAccount } from "@/api/auth/auth.service";
import { geocodeAddress } from "@/api/household/geocoding";
import { getHouseholdSettings, saveHouseholdSettings } from "@/api/household/household-settings.service";
import { getWeatherSettings, saveWeatherSettings } from "@/api/weather/weather.service";
import { AUDIT_CHANNELS, auditQuerySchema } from "@/features/audit/types/audit";
import { formatHomeAddress, type GeocodeOutcome, type HomeAddress } from "@/features/household/types/household-settings";
import { WEATHER_PROVIDER_IDS, WEATHER_PROVIDER_NAMES } from "@/features/weather/types/weather";
import { LOCALES } from "@/types/common";
import { formatDateTime } from "@/types/date-format";
import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";
import { appText, capList, done, registerAssistantSkill, registerAssistantTool, say } from "@ai/core/kit";
import "./notifications";

/**
 * Skill "settings": what the Settings page holds that no other skill covers: the household's name and address
 * (geocoded for the weather), the weather source, the person's language, the activity log (Settings › Activity,
 * owners and adults) and the notifications (notifications.ts: the bell, preferences, quiet hours). Waste
 * collector settings, push devices and "my account" (e-mail, password, sessions) stay in the app.
 */

const MANAGERS = ["owner", "adult"] as const;
const EVERYONE = ["owner", "adult", "child"] as const;

registerAssistantSkill({
  id: "settings",
  title: { en: "Settings, activity and notifications", nl: "Instellingen, activiteit en meldingen" },
  summary: "Household name and address, weather source, language, the activity log (who changed what), notifications and their preferences.",
  keywords: {
    nl: ["instelling", "instellingen", "adres", "verhuisd", "verhuizen", "weerbron", "weerdienst", "taal", "activiteit", "logboek", "wie heeft", "gewijzigd", "veranderd", "melding", "meldingen", "notificatie", "stille uren", "ongelezen"],
    en: ["setting", "settings", "address", "moved", "weather provider", "weather source", "language", "activity", "audit", "who changed", "changed", "notification", "notifications", "quiet hours", "unread"],
  },
});

// ── Overview ──────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "settings.overview",
  description: "The household's settings: name, home address and whether it has a location (for the weather), the weather source and the options, the person's language.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the settings", nl: "Instellingen bekeken" },
  run: async (ctx) => {
    const [household, weather] = await Promise.all([getHouseholdSettings(ctx.householdId), getWeatherSettings(ctx.householdId)]);
    return {
      household: household.name,
      address: household.address ? formatHomeAddress(household.address, say(ctx.locale, "box", "bus")) : null,
      // Whether the weather has a location; never which outside service found it.
      location: household.location ? (household.location.source === "manual" ? "set by hand" : "found from the address") : "none (no weather forecast)",
      timeZone: household.timeZone,
      weather: WEATHER_PROVIDER_NAMES[weather.providerId],
      weatherOptions: weather.providers.map((provider) => `${provider.id} (${provider.name}${provider.available ? "" : ", not configured on the server"})`),
      language: ctx.locale,
    };
  },
});

// ── Address ───────────────────────────────────────────────────────────────────────────────────────────

const addressInput = z.object({
  street: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(12),
  box: z.string().trim().max(12).optional(),
  postalCode: z.string().trim().regex(/^\d{4}$/).describe("4-digit Belgian postal code"),
  municipality: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80).optional().describe("New household name (optional)"),
});
type AddressInput = z.output<typeof addressInput>;

const toAddress = (input: AddressInput): HomeAddress => ({
  street: input.street,
  number: input.number,
  box: input.box || null,
  postalCode: input.postalCode,
  municipality: input.municipality,
  country: "BE",
});

const GEOCODE_TEXT: Record<GeocodeOutcome, [string, string]> = {
  found: ["location found", "locatie gevonden"],
  manual: ["location kept as set by hand", "locatie zoals ingesteld behouden"],
  kept: ["location kept", "locatie behouden"],
  not_found: ["address saved, but no location found: the weather needs one (set it by hand in Settings › Household)", "adres bewaard, maar geen locatie gevonden: het weer heeft er een nodig (stel ze in bij Instellingen › Huishouden)"],
  failed: ["address saved; the location lookup failed, try again later", "adres bewaard; de locatie opzoeken mislukte, probeer later opnieuw"],
  cleared: ["address removed", "adres verwijderd"],
};

/** Looks the address up without saving (for the confirmation card), at most a few seconds. */
async function lookUp(address: HomeAddress): Promise<"found" | "not_found" | "failed"> {
  const timeout = new Promise<"failed">((resolve) => setTimeout(() => resolve("failed"), 5000).unref());
  const lookup = geocodeAddress(address).then((found) => (found ? ("found" as const) : ("not_found" as const)), () => "failed" as const);
  return Promise.race([lookup, timeout]);
}

registerAssistantTool({
  name: "settings.set_address",
  description: "Change the home address (Belgium) and optionally the household name. The address is looked up for the weather location.",
  input: addressInput,
  permission: "write",
  confirm: "always",
  roles: MANAGERS,
  activity: { en: "Changed the home address", nl: "Huisadres gewijzigd" },
  describe: (ctx, input) => say(ctx.locale, `Set the home address to ${formatHomeAddress(toAddress(input), "box")}`, `Huisadres wijzigen naar ${formatHomeAddress(toAddress(input))}`),
  preview: async (ctx, input) => {
    const current = await getHouseholdSettings(ctx.householdId);
    const box = say(ctx.locale, "box", "bus");
    const found = await lookUp(toAddress(input));
    const location = { found: say(ctx.locale, "found ✓", "gevonden ✓"), not_found: say(ctx.locale, "not found: saved without location", "niet gevonden: bewaard zonder locatie"), failed: say(ctx.locale, "looked up when saved", "opgezocht bij het bewaren") }[found];
    return {
      kind: "fields",
      data: {
        fields: [
          ...(input.name && input.name !== current.name ? [{ label: say(ctx.locale, "Name", "Naam"), value: `${current.name} → ${input.name}` }] : []),
          { label: say(ctx.locale, "Address", "Adres"), value: `${current.address ? formatHomeAddress(current.address, box) : "–"} → ${formatHomeAddress(toAddress(input), box)}` },
          { label: say(ctx.locale, "Location", "Locatie"), value: location },
        ],
      },
    };
  },
  run: async (ctx, input) => {
    const current = await getHouseholdSettings(ctx.householdId);
    // Coordinates set by hand stay when the address itself doesn't change (only the name, or a typo'd case).
    const same = current.address !== null && formatHomeAddress(current.address).toLowerCase() === formatHomeAddress(toAddress(input)).toLowerCase();
    const manual = same && current.location?.source === "manual" ? current.location : null;
    const result = await saveHouseholdSettings(ctx.householdId, {
      name: input.name ?? current.name,
      street: input.street,
      number: input.number,
      box: input.box || null,
      postalCode: input.postalCode,
      municipality: input.municipality,
      locationMode: manual ? "manual" : "auto",
      latitude: manual?.latitude ?? null,
      longitude: manual?.longitude ?? null,
    });
    const address = result.settings.address ? formatHomeAddress(result.settings.address) : "–";
    return done(`Home address is now ${address}: ${GEOCODE_TEXT[result.geocode][0]}.`);
  },
});

// ── Weather source and language ───────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "settings.set_weather_provider",
  description: "Choose where the weather forecast comes from (open-meteo, kmi, google). One that isn't configured on the server can't be chosen.",
  input: z.object({ provider: z.enum(WEATHER_PROVIDER_IDS) }),
  permission: "write",
  confirm: "first-time",
  roles: MANAGERS,
  activity: { en: "Changed the weather source", nl: "Weerbron gewijzigd" },
  describe: (ctx, input) => say(ctx.locale, `Use ${WEATHER_PROVIDER_NAMES[input.provider]} for the weather`, `${WEATHER_PROVIDER_NAMES[input.provider]} gebruiken voor het weer`),
  run: async (ctx, input) => {
    const saved = await saveWeatherSettings(ctx.householdId, { providerId: input.provider });
    return done(`The forecast now comes from ${WEATHER_PROVIDER_NAMES[saved.providerId]}.`);
  },
});

registerAssistantTool({
  name: "settings.set_language",
  description: "Change the app language of the person asking (en or nl). Takes effect after a reload.",
  input: z.object({ language: z.enum(LOCALES) }),
  permission: "write",
  confirm: "first-time",
  roles: EVERYONE,
  activity: { en: "Changed the language", nl: "Taal gewijzigd" },
  describe: (ctx, input) => say(ctx.locale, `Switch your app language to ${input.language === "nl" ? "Dutch" : "English"}`, `Je app-taal wijzigen naar ${input.language === "nl" ? "Nederlands" : "Engels"}`),
  run: async (ctx, input) => {
    await updateAccount(ctx.user.id, { locale: input.language });
    return done(`Language set to ${input.language}; reload the app to see it.`);
  },
});

// ── Activity log (Settings › Activity) ────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "settings.activity",
  description: "The activity log: who changed what and when, through the app, the assistant, MCP or a scheduled job, newest first. For 'who changed X' / 'wie heeft … gewijzigd', search with a name or word.",
  input: z.object({
    search: z.string().trim().max(100).optional().describe("Words in who, what or the target, e.g. 'Fluvius', 'Clara', 'alarm'"),
    channel: z.enum(AUDIT_CHANNELS).optional(),
    limit: z.number().int().min(1).max(30).default(12),
  }),
  permission: "read",
  confirm: "never",
  roles: MANAGERS,
  activity: { en: "Checked the activity log", nl: "Activiteit bekeken" },
  run: async (ctx, input) => {
    const page = await listAuditEntries(ctx.householdId, auditQuerySchema.parse({ q: input.search, channel: input.channel, limit: input.limit }));
    const entries = page.entries.map((entry) => {
      // As the app shows it: the translated action for the app's own actions, else the confirmation text.
      const known = appText(`audit:actions.${entry.action}`, ctx.locale);
      const what = known ? [known, entry.targetLabel, entry.summary] : [entry.summary ?? entry.action, entry.targetLabel];
      const who = entry.channel === "job" ? `job ${entry.actorName}` : `${entry.actorName} (${entry.channel})`;
      return `${formatDateTime(entry.at, ctx.locale, { timeZone: HOUSEHOLD_TIME_ZONE })} · ${who} · ${what.filter(Boolean).join(" · ")}`;
    });
    return entries.length
      ? { ...capList(entries, input.limit), older: page.nextCursor ? "more in Settings › Activity" : null }
      : { items: [], note: input.search ? `Nothing in the log matches "${input.search}".` : "The log is empty." };
  },
});
