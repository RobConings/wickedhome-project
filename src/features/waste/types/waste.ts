import { z } from "zod";
import { isoDateSchema } from "@/types/common";
import { addDays } from "@/types/dates";

/**
 * Waste collection: which collector serves the home (a provider adapter in src/api/waste/providers),
 * the address as that provider knows it, and the collection days fetched from it. Contract of
 * `/api/waste/*`, shared by the API, the settings section, the dashboard card and the tests.
 */

// ── Fractions ─────────────────────────────────────────────────────────────────────────────────────────

/** Normalised kinds of waste. Providers keep their own label and colour next to it. */
export const WASTE_FRACTIONS = ["residual", "organic", "pmd", "paper", "glass", "textile", "garden", "bulky", "other"] as const;
export const wasteFractionSchema = z.enum(WASTE_FRACTIONS);
export type WasteFraction = z.infer<typeof wasteFractionSchema>;

/** Default colour per fraction, used when the provider has none (Limburg.net) and for icons. */
export const WASTE_FRACTION_COLORS: Record<WasteFraction, string> = {
  residual: "#6b7280",
  organic: "#5f8f2f",
  pmd: "#3b82b6",
  paper: "#d9912b",
  glass: "#2f8f86",
  textile: "#7c5cc4",
  garden: "#3f6f2a",
  bulky: "#8a5a3c",
  other: "#6b7280",
};

/** Lower-cases, strips accents and punctuation: "Papier & karton" → "papier karton". */
const simplify = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

/**
 * Keyword rules, checked in order. Organic comes before garden, because "GFT" is "groente-, fruit- en
 * tuinafval" and contains "tuin". Dutch, French, German and English labels.
 */
const FRACTION_RULES: [WasteFraction, RegExp][] = [
  ["pmd", /\b(p ?\+? ?md|pmc|pmk|plastic|blik|drankkarton|canettes)\b/],
  ["paper", /\b(papier|karton|paper|carton|cardboard|papiers?|cartons?|pappe)\b/],
  ["glass", /\b(glas|glass|verre|glasbak)\b/],
  ["textile", /\b(textiel|textile|textiles|kleding|vetements|kleider)\b/],
  ["organic", /\b(gft|vgf|groente|keuken ?afval|keukenafval|etensresten|organic|organique|organiques|biodechets|food|kitchen|bioabfall|dechets de cuisine|swill)\b/],
  ["garden", /\b(tuin ?afval|tuinafval|snoei ?hout|snoeihout|snoeiafval|groen ?afval|groenafval|garden|jardin|dechets verts|branches|grunschnitt)\b/],
  ["bulky", /\b(grof ?vuil|grofvuil|grof huisvuil|bulky|encombrants?|sperrmull)\b/],
  ["residual", /\b(rest ?afval|restafval|huisvuil|huishoudelijk afval|residual|residuels?|ordures|dechets menager(e)?s|tout venant|restmull|household waste|non recyclables?)\b/],
];

/** The normalised fraction for a provider's label. Unknown labels are `"other"`. */
export function normaliseFraction(label: string): WasteFraction {
  const text = simplify(label);
  for (const [fraction, rule] of FRACTION_RULES) {
    if (rule.test(text)) return fraction;
  }
  return "other";
}

// ── Providers ─────────────────────────────────────────────────────────────────────────────────────────

/** Provider ids. Strings in the database, so adding one needs no migration. */
export const WASTE_PROVIDER_IDS = ["limburg-net", "recycle-app"] as const;
export const wasteProviderIdSchema = z.enum(WASTE_PROVIDER_IDS);
export type WasteProviderId = z.infer<typeof wasteProviderIdSchema>;

export type WasteProviderInfo = {
  id: WasteProviderId;
  name: string;
  website: string;
  /** Postal codes it serves, when that is a fixed, known list (Limburg.net: 3500–3999). */
  postalCodeRanges: [number, number][] | null;
  /** True when the provider decides coverage per postal code at lookup time (Recycle!). */
  checksCoverage: boolean;
};

/**
 * The address to look up at a provider: the home address by default, editable in the form (Limburg.net
 * wants the main municipality, e.g. "Hasselt" rather than "Kermt").
 */
export const wasteLookupInputSchema = z.object({
  providerId: wasteProviderIdSchema,
  postalCode: z.string().trim().regex(/^\d{4}$/),
  municipality: z.string().trim().max(80).optional().nullable(),
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(12),
  box: z.string().trim().max(12).optional().nullable(),
});
export type WasteLookupInput = z.infer<typeof wasteLookupInputSchema>;

/** One address the provider knows. `address` holds the provider's own identifiers; send it back to save. */
export type WasteAddressMatch = {
  label: string;
  address: Record<string, string>;
};

/** Which step of the lookup found nothing, so the form can point at the field. */
export const WASTE_LOOKUP_PROBLEMS = ["not_covered", "municipality", "street", "number", "provider_error"] as const;
export type WasteLookupProblem = (typeof WASTE_LOOKUP_PROBLEMS)[number];

export type WasteLookupResult = {
  matches: WasteAddressMatch[];
  problem: WasteLookupProblem | null;
};

/** Body of `PUT /api/waste/setup`: a match from the lookup. */
export const wasteSetupInputSchema = z.object({
  providerId: wasteProviderIdSchema,
  label: z.string().trim().min(1).max(200),
  address: z.record(z.string().max(40), z.string().max(200)),
});
export type WasteSetupInput = z.infer<typeof wasteSetupInputSchema>;

// ── Setup and collections ─────────────────────────────────────────────────────────────────────────────

export const WASTE_SYNC_STATUSES = ["ok", "error"] as const;
export type WasteSyncStatus = (typeof WASTE_SYNC_STATUSES)[number];

export type WasteSetup = {
  providerId: WasteProviderId;
  providerName: string;
  addressLabel: string;
  /** ISO timestamps. */
  lastSyncAt: string | null;
  lastSyncStatus: WasteSyncStatus | null;
  lastSyncError: string | null;
  lastSuccessAt: string | null;
  /** The "put the bins out" task per collection day. */
  tasks: WasteTaskSettings;
};

// ── Bins tasks ────────────────────────────────────────────────────────────────────────────────────────

/** When the bins task is due: the evening before the collection, or the morning of it. */
export const WASTE_TASK_TIMINGS = ["evening_before", "morning_of"] as const;
export const wasteTaskTimingSchema = z.enum(WASTE_TASK_TIMINGS);
export type WasteTaskTiming = z.infer<typeof wasteTaskTimingSchema>;

/** The time of day each timing stands for. */
export const WASTE_TASK_TIMES: Record<WasteTaskTiming, string> = { evening_before: "20:00", morning_of: "07:00" };

/** Bins tasks are kept for the collection days in the coming two weeks; the daily sync adds the next ones. */
export const WASTE_TASK_DAYS = 14;

export type WasteTaskSettings = {
  /** On by default. */
  enabled: boolean;
  timing: WasteTaskTiming;
  /** Habitants it goes to, in rotation order; empty: unassigned (people can still assign each task). */
  assigneeIds: string[];
  /** With several assignees: one per collection day, taking turns. Off: all of them on every task. */
  rotate: boolean;
};

export const DEFAULT_WASTE_TASK_SETTINGS: WasteTaskSettings = { enabled: true, timing: "evening_before", assigneeIds: [], rotate: true };

/** Body of `PUT /api/waste/task-settings`. */
export const wasteTaskSettingsInputSchema = z.object({
  enabled: z.boolean(),
  timing: wasteTaskTimingSchema,
  assigneeIds: z.array(z.string().min(1).max(40)).max(20).default([]),
  rotate: z.boolean().default(true),
});
export type WasteTaskSettingsInput = z.infer<typeof wasteTaskSettingsInputSchema>;

/** Due date and time of the bins task for a collection day: 20:00 the evening before, or 07:00 that morning. */
export function wasteTaskDue(collectionDate: string, timing: WasteTaskTiming): { dueDate: string; dueTime: string } {
  return { dueDate: timing === "evening_before" ? addDays(collectionDate, -1) : collectionDate, dueTime: WASTE_TASK_TIMES[timing] };
}

const WASTE_TASK_TITLE_PREFIX: Record<"en" | "nl", string> = { en: "Put out", nl: "Buitenzetten" };

/** "Put out: Pmd + Papier & karton" (stored, so in the household's language; the labels are the provider's). */
export function wasteTaskTitle(collections: Pick<WasteCollection, "label">[], locale: string): string {
  return `${WASTE_TASK_TITLE_PREFIX[locale === "nl" ? "nl" : "en"]}: ${wasteDayTitle(collections)}`;
}

export type WasteCollection = {
  fraction: WasteFraction;
  /** The provider's label, e.g. "Pmd", "Papier & karton". */
  label: string;
  /** `#rrggbb`: the provider's colour, else the fraction's. */
  color: string;
  note: string | null;
};

/** Everything collected on one day. */
export type WasteDay = {
  date: string;
  collections: WasteCollection[];
};

/** `GET /api/waste/settings`: the setup screen. */
export type WasteSettings = {
  setup: WasteSetup | null;
  providers: WasteProviderInfo[];
  /** Suggested from the home address's postal code; `null` without an address. */
  suggestedProviderId: WasteProviderId | null;
  /** Next collection days (up to 4), to confirm the setup works. */
  upcoming: WasteDay[];
};

/** `GET /api/waste/summary`: the dashboard card. */
export type WasteSummary = {
  setup: WasteSetup | null;
  /** The next collection days from today (up to 3, within 6 weeks). */
  upcoming: WasteDay[];
};

/** Query of `GET /api/waste/collections`. */
export const wasteRangeQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((range) => range.to >= range.from, { path: ["to"], message: "to must be on or after from" });

/** "PMD + Papier & karton": the provider labels of one day, in a stable order. */
export function wasteDayTitle(collections: Pick<WasteCollection, "label">[]): string {
  return collections.map((collection) => collection.label.trim()).join(" + ");
}

/** Sort order of fractions within a day, so the same day always reads the same. */
export const compareWasteCollections = (a: Pick<WasteCollection, "fraction" | "label">, b: Pick<WasteCollection, "fraction" | "label">) =>
  WASTE_FRACTIONS.indexOf(a.fraction) - WASTE_FRACTIONS.indexOf(b.fraction) || a.label.localeCompare(b.label);

/** When the next collection is: today, tomorrow (put it out tonight) or later. */
export type WasteTiming = "today" | "tomorrow" | "later";

export function wasteTiming(date: string, today: string, tomorrow: string): WasteTiming {
  if (date === today) return "today";
  if (date === tomorrow) return "tomorrow";
  return "later";
}

/** Suggests a provider for a postal code: a provider with a fixed range that contains it, else Recycle!. */
export function suggestWasteProvider(postalCode: string | null | undefined, providers: WasteProviderInfo[]): WasteProviderId | null {
  if (!postalCode || !/^\d{4}$/.test(postalCode)) return null;
  const code = Number(postalCode);
  const fixed = providers.find((provider) => provider.postalCodeRanges?.some(([from, to]) => code >= from && code <= to));
  return fixed?.id ?? providers.find((provider) => provider.checksCoverage)?.id ?? null;
}

/** Adults and owners set up the collector; everyone sees the collections. Mirrors the API's role check. */
export const canManageWaste = (role: "owner" | "adult" | "child") => role !== "child";
