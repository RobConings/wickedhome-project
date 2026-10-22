import { z } from "zod";
import { normaliseFraction, type WasteAddressMatch, type WasteLookupInput, type WasteLookupResult } from "@/features/waste/types/waste";
import { fetchJsonFromFixedHost } from "../../lib/fixed-host-fetch";
import { HEX_COLOR, sameName, type ProviderCollection, type WasteProvider } from "./provider";

/*
 * Recycle! (recycleapp.be) by Fost Plus: one platform with the collection calendars of most Belgian
 * municipalities and their intercommunales (IVAGO, IVBO, Mirom, IMOG, Interza, Ecowerf, IOK, IGEAN,
 * ILvA, Intradura, Verko, Incovo, Bruxelles-Propreté, Intradel, BEP, Hygea, ipalle, IDEA, …). Limburg.net
 * municipalities are listed but not available here.
 *
 *   GET  /zipcodes?q=9000                          → { items: [{ id: "9000-44021", code, names, available }] }
 *   POST /streets?q=Veldstraat&zipcodes=<zip id>   → { items: [{ id: "https://data.vlaanderen.be/id/straatnaam-…", name, names }] }
 *   GET  /collections?zipcodeId&streetId&houseNumber&fromDate&untilDate&size&page
 *        → { items: [{ type: "collection", timestamp, fraction: { id, name: { nl, fr, de, en }, color }, exception? }], pages }
 *
 * All calls need the header `x-consumer: recycleapp.be`. Timestamps are midnight (UTC or Brussels) of
 * the collection day. Items with `exception.replacedBy` were moved to another day (which is listed itself).
 */

const HOST = "api.fostplus.be";
const BASE = `https://${HOST}/recyclecms/public/v1`;
const HEADERS = { "x-consumer": "recycleapp.be" };

type Names = Partial<Record<"nl" | "fr" | "de" | "en", string>>;
type Language = "nl" | "fr";

async function call<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchJsonFromFixedHost<T>(url.toString(), {
    allowedHosts: [HOST],
    method,
    headers: HEADERS,
    timeoutMs: 10_000,
    maxBytes: 2_000_000,
  });
}

/** Walloon postal codes get French labels; the rest (Flanders, Brussels) Dutch. */
export const languageFor = (postalCode: string): Language => {
  const code = Number(postalCode);
  return (code >= 1300 && code <= 1499) || (code >= 4000 && code <= 7999) ? "fr" : "nl";
};

const pick = (names: Names | undefined, language: Language) =>
  names?.[language] ?? names?.nl ?? names?.fr ?? names?.en ?? names?.de ?? "";

const addressSchema = z.object({
  zipcodeId: z.string().regex(/^\d{4}-\d{5}$/),
  postalCode: z.string().regex(/^\d{4}$/),
  municipality: z.string().min(1).max(80),
  streetId: z.string().min(1).max(160).regex(/^[\w:/.\-#]+$/),
  street: z.string().min(1).max(120),
  houseNumber: z.string().regex(/^[0-9A-Za-z/-]{1,12}$/),
  language: z.enum(["nl", "fr"]).default("nl"),
});
type RecycleAddress = z.infer<typeof addressSchema>;

type Zipcode = { id: string; code: string; names?: Names[]; city?: { name?: string; names?: Names }; available?: boolean };
type Street = { id: string; name: string; names?: Names };

export type RecycleCollectionsResponse = {
  items?: {
    type?: string;
    timestamp?: string;
    fraction?: { id?: string; name?: Names; color?: string };
    exception?: { replacedBy?: unknown; replaces?: unknown; reason?: { name?: Names } };
  }[];
  pages?: number;
};

/**
 * The collection day of a timestamp. Midnight UTC and midnight in Brussels (22:00/23:00 UTC the day
 * before) both appear; adding 12 hours lands on the right day either way.
 */
export function collectionDate(timestamp: string): string | null {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return null;
  return new Date(time + 12 * 3_600_000).toISOString().slice(0, 10);
}

export function parseRecycleCollections(body: RecycleCollectionsResponse, language: Language): ProviderCollection[] {
  const seen = new Set<string>();
  const collections: ProviderCollection[] = [];
  for (const item of body.items ?? []) {
    if (item.type !== "collection" || !item.fraction?.id || !item.timestamp) continue;
    if (item.exception?.replacedBy) continue;
    const date = collectionDate(item.timestamp);
    if (!date) continue;
    const key = `${date}|${item.fraction.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = pick(item.fraction.name, language).trim() || "?";
    // The fraction's English name normalises most reliably; fall back to the shown label.
    const fraction = normaliseFraction(item.fraction.name?.en ?? label);
    collections.push({
      date,
      fraction: fraction === "other" ? normaliseFraction(label) : fraction,
      providerKey: item.fraction.id,
      label,
      color: item.fraction.color && HEX_COLOR.test(item.fraction.color) ? item.fraction.color.toLowerCase() : null,
      note: item.exception?.replaces ? pick(item.exception.reason?.name, language) || null : null,
    });
  }
  return collections;
}

/** "Th. De Beckerstraat" doesn't search well with the part before the dot; Recycle! finds "De Beckerstraat". */
const streetSearchTerm = (street: string) => street.split(".").at(-1)?.trim() || street;

async function lookup(input: WasteLookupInput): Promise<WasteLookupResult> {
  const zipcodes = (await call<{ items?: Zipcode[] }>("GET", "/zipcodes", { q: input.postalCode })).items ?? [];
  const local = zipcodes.filter((zipcode) => zipcode.code === input.postalCode);
  const available = local.filter((zipcode) => zipcode.available);
  if (available.length === 0) return { matches: [], problem: "not_covered" };

  const language = languageFor(input.postalCode);
  const matches: WasteAddressMatch[] = [];
  for (const zipcode of available) {
    const streets =
      (await call<{ items?: Street[] }>("POST", "/streets", { q: streetSearchTerm(input.street), zipcodes: zipcode.id })).items ?? [];
    const named = (street: Street) => [street.name, ...Object.values(street.names ?? {})].some((name) => sameName(name, input.street));
    const exact = streets.filter(named);
    // The city (main municipality), not the first sub-municipality of the postal code.
    const municipality =
      pick(zipcode.city?.names, language) || zipcode.city?.name || pick(zipcode.names?.[0], language) || input.municipality || input.postalCode;
    for (const street of (exact.length ? exact : streets).slice(0, 5)) {
      const address: RecycleAddress = {
        zipcodeId: zipcode.id,
        postalCode: input.postalCode,
        municipality,
        streetId: street.id,
        street: pick(street.names, language) || street.name,
        houseNumber: input.number.replace(/\s+/g, ""),
        language,
      };
      matches.push({ label: `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.municipality}`, address });
    }
  }
  return { matches: matches.slice(0, 10), problem: matches.length ? null : "street" };
}

async function fetchCollections(raw: Record<string, string>, from: string, to: string): Promise<ProviderCollection[]> {
  const address = addressSchema.parse(raw);
  const collections: ProviderCollection[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const body = await call<RecycleCollectionsResponse>("GET", "/collections", {
      zipcodeId: address.zipcodeId,
      streetId: address.streetId,
      houseNumber: address.houseNumber,
      fromDate: from,
      untilDate: to,
      size: "100",
      page: String(page),
    });
    collections.push(...parseRecycleCollections(body, address.language));
    if (!body.pages || page >= body.pages) break;
  }
  // The API's range is inclusive in UTC; keep exactly the requested days.
  return collections.filter((collection) => collection.date >= from && collection.date <= to);
}

export const recycleAppProvider: WasteProvider = {
  info: {
    id: "recycle-app",
    name: "Recycle! (Fost Plus)",
    website: "https://www.recycleapp.be",
    postalCodeRanges: null,
    checksCoverage: true,
  },
  lookup,
  parseAddress(address) {
    const parsed = addressSchema.safeParse(address);
    return parsed.success ? parsed.data : null;
  },
  fetchCollections,
};
