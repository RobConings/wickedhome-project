import { z } from "zod";
import { idSchema } from "@/types/common";
import type { ProjectRef } from "@/types/projects";

/*
 * Contacts: the people and organisations a household deals with (a contractor, the plumber, a supplier, the bank,
 * the school…). Household-wide; favourites and recently used are per person (selections, entity type "contact").
 * A contact can work on projects with a role ("aannemer", "architect") and can point at a supplier's shop.
 */

// ── Trades ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Trades offered as suggestions (the trade itself is free text, stored as typed), with the words people use for
 * them in Dutch and English. The form suggests the word of the current language; search and the assistant match
 * every word of an entry, so "the contractor" finds a contact whose trade is "aannemer".
 */
export const CONTACT_TRADES = [
  { key: "contractor", nl: "aannemer", en: "contractor", also: ["bouwbedrijf", "builder"] },
  { key: "architect", nl: "architect", en: "architect", also: [] },
  { key: "plumber", nl: "loodgieter", en: "plumber", also: ["sanitair"] },
  { key: "electrician", nl: "elektricien", en: "electrician", also: [] },
  { key: "carpenter", nl: "schrijnwerker", en: "carpenter", also: ["timmerman", "joiner", "schrijnwerkerij"] },
  { key: "roofer", nl: "dakwerker", en: "roofer", also: ["dakdekker"] },
  { key: "landscaper", nl: "tuinaannemer", en: "landscaper", also: ["hovenier", "gardener", "tuinman"] },
  { key: "painter", nl: "schilder", en: "painter", also: [] },
  { key: "tiler", nl: "tegelzetter", en: "tiler", also: ["tegelzetten"] },
  { key: "heating", nl: "chauffagist", en: "heating engineer", also: ["verwarming", "heating", "installateur"] },
  { key: "supplier", nl: "leverancier", en: "supplier", also: [] },
  { key: "bank", nl: "bank", en: "bank", also: [] },
  { key: "insurance", nl: "verzekeraar", en: "insurer", also: ["verzekering", "insurance", "makelaar"] },
  { key: "school", nl: "school", en: "school", also: [] },
  { key: "doctor", nl: "huisarts", en: "doctor", also: ["dokter", "arts", "gp"] },
  { key: "notary", nl: "notaris", en: "notary", also: [] },
  { key: "accountant", nl: "boekhouder", en: "accountant", also: ["accountant"] },
  { key: "cleaner", nl: "poetshulp", en: "cleaner", also: ["poetsvrouw", "schoonmaak"] },
  { key: "mechanic", nl: "garagist", en: "mechanic", also: ["garage"] },
] as const satisfies readonly { key: string; nl: string; en: string; also: readonly string[] }[];

export type ContactTrade = (typeof CONTACT_TRADES)[number];

/** Roles offered when linking a contact to a project (free text too). Keys of `CONTACT_TRADES`. */
export const PROJECT_ROLE_SUGGESTIONS = ["contractor", "architect", "plumber", "electrician", "carpenter", "roofer", "painter", "tiler", "heating", "landscaper", "supplier"] as const;

/** Lower case without accents, single spaces. */
export const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const tradeWordsOf = (trade: ContactTrade): string[] => [trade.nl, trade.en, ...trade.also];

/** The suggestion entry a typed trade or role belongs to ("Aannemer", "contractor", "bouwbedrijf" → contractor). */
export function findTrade(value: string | null | undefined): ContactTrade | null {
  if (!value) return null;
  const folded = foldText(value);
  return CONTACT_TRADES.find((trade) => tradeWordsOf(trade).some((word) => foldText(word) === folded)) ?? null;
}

/** Every word that names the same trade, the typed value first: "aannemer" → aannemer, contractor, bouwbedrijf, builder. */
export function tradeSynonyms(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const trade = findTrade(value);
  const words = [value.trim(), ...(trade ? tradeWordsOf(trade) : [])];
  const seen = new Set<string>();
  return words.filter((word) => !seen.has(foldText(word)) && Boolean(seen.add(foldText(word))));
}

/** The suggestion word in a language ("contractor" → "aannemer" in Dutch). */
export const tradeLabel = (trade: ContactTrade, locale: "en" | "nl") => trade[locale];

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────

/** At most this many email addresses and phone numbers per contact. */
export const MAX_CONTACT_VALUES = 5;

/** Only web links; never `javascript:` or other schemes we would render as a link. */
const websiteUrlSchema = z.url({ protocol: /^https?$/ }).max(500);

export const contactEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));
/** Digits with the usual separators, optionally starting with +: "+32 470 12 34 56", "011/22.33.44". */
export const contactPhoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^\+?[\d\s./()-]+$/, "invalidPhone")
  .refine((value) => (value.match(/\d/g)?.length ?? 0) >= 3, "invalidPhone");

/** Error codes the contract produces itself; the form translates them (`contacts:errors.<code>`). */
export const CONTACT_ERROR_CODES = ["invalidPhone", "duplicateValue"] as const;

const noDuplicates = (values: string[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = foldText(value).replace(/[\s./()-]/g, "");
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: [index], message: "duplicateValue" });
    seen.add(key);
  });
};

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  company: z.string().trim().max(100).optional().nullable(),
  trade: z.string().trim().max(60).optional().nullable(),
  emails: z.array(contactEmailSchema).max(MAX_CONTACT_VALUES).superRefine(noDuplicates).default([]),
  phones: z.array(contactPhoneSchema).max(MAX_CONTACT_VALUES).superRefine(noDuplicates).default([]),
  address: z.string().trim().max(300).optional().nullable(),
  websiteUrl: websiteUrlSchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** The supplier's shop. */
  shopId: idSchema.optional().nullable(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

/** Several values posted as one form field, one per line (the multi-value input joins them). */
const lines = (value: unknown) =>
  typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : Array.isArray(value)
      ? value
      : [];

/**
 * The contact form as posted: emails and phones one per line, and "example.be" without https://. Optionally
 * links the new contact to a project right away (`projectId` + `projectRole`, from a project's page).
 */
export const contactFormSchema = contactInputSchema.extend({
  emails: z.preprocess(lines, contactInputSchema.shape.emails),
  phones: z.preprocess(lines, contactInputSchema.shape.phones),
  websiteUrl: z.preprocess(
    (value) => (typeof value === "string" && !/^[a-z][a-z\d+.-]*:/i.test(value) ? `https://${value}` : value),
    contactInputSchema.shape.websiteUrl,
  ),
  projectId: idSchema.optional().nullable(),
  projectRole: z.string().trim().max(60).optional().nullable(),
});
export type ContactFormInput = z.infer<typeof contactFormSchema>;

/** Query string of `GET /api/contacts`. */
export const contactListQuerySchema = z.object({
  /** Name, company, trade (in either language), email, phone or a linked project's name; accents ignored. */
  q: z.string().trim().max(100).optional(),
  /** Only the contacts linked to this project. */
  projectId: idSchema.optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

/** Body of `PUT /api/contacts/:id/projects/:projectId`: link (or change the role on) a project. */
export const contactProjectLinkSchema = z.object({
  role: z.string().trim().max(60).optional().nullable(),
});
export type ContactProjectLinkInput = z.infer<typeof contactProjectLinkSchema>;

// ── Output ──────────────────────────────────────────────────────────────────────────────────────────

/** A project the contact works on, with their role there. */
export type ContactProjectLink = ProjectRef & {
  role: string | null;
  /** The project is planned or active (not done or cancelled). */
  running: boolean;
};

export type Contact = {
  id: string;
  name: string;
  company: string | null;
  trade: string | null;
  /** The first one is the primary address. */
  emails: string[];
  /** The first one is the primary number. */
  phones: string[];
  address: string | null;
  websiteUrl: string | null;
  notes: string | null;
  shop: { id: string; name: string } | null;
  /** Running projects first, then by name. */
  projects: ContactProjectLink[];
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
};

/** "aannemer · Bouwbedrijf Peeters", or whichever of the two is there. */
export const contactSubtitle = (contact: Pick<Contact, "trade" | "company">) =>
  [contact.trade, contact.company].filter((part): part is string => Boolean(part?.trim())).join(" · ");

/** `tel:` link of a phone number (spaces and separators removed). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const mailtoHref = (email: string) => `mailto:${email}`;

type Role = "owner" | "adult" | "child";

/** Adults and owners add, edit, delete and link contacts; children look them up (and may call them). Mirrors the API. */
export const canManageContacts = (role: Role) => role !== "child";
