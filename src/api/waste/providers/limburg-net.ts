import { z } from "zod";
import { normaliseFraction, type WasteAddressMatch, type WasteLookupInput, type WasteLookupResult } from "@/features/waste/types/waste";
import { fetchJsonFromFixedHost } from "../../lib/fixed-host-fetch";
import { sameName, splitHouseNumber, type ProviderCollection, type WasteProvider } from "./provider";

/*
 * Limburg.net: the intermunicipal waste company of the province of Limburg (postal codes 3500–3999).
 * Its public website (limburg.net/afvalkalender) talks to a JSON API behind `/api-proxy/public`; the same
 * identifiers make up its ICS feed (`/ics/afvalkalender/<nis>/<street>/<number>/<addition>`).
 *
 *   GET /afval-kalender/gemeenten/search?query=Hasselt            → [{ nisCode, naam }]
 *   GET /afval-kalender/gemeente/<nis>/straten/search?query=…      → [{ nummer, naam }]
 *   GET /afval-kalender/straat/<nummer>/huisnummers/search?query=… → [{ huisNummer, toevoeging }]
 *   GET /kalender/<nis>/<YYYY-MM>?straatNummer=&huisNummer=&toevoeging=
 *       → { activiteitenLegende: { <code>: { omschrijving } }, ophalingen: { lijstVanOphaalDagen: [{ datum, activiteitCode, displayReden }] } }
 *
 * `datum` is a local timestamp ("2026-10-07T21:00:03+02:00"); the date part is the collection day.
 * Holiday shifts are already applied by Limburg.net. A year's calendar is published around December.
 */

const HOST = "limburg.net";
const BASE = `https://${HOST}/api-proxy/public`;

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchJsonFromFixedHost<T>(url.toString(), { allowedHosts: [HOST], timeoutMs: 10_000, maxBytes: 1_000_000 });
}

const addressSchema = z.object({
  nisCode: z.string().regex(/^\d{5}$/),
  municipality: z.string().min(1).max(80),
  streetId: z.string().regex(/^\d{1,12}$/),
  street: z.string().min(1).max(120),
  houseNumber: z.string().regex(/^[0-9A-Za-z/-]{1,12}$/),
  addition: z
    .string()
    .regex(/^[0-9A-Za-z]{0,6}$/)
    .default(""),
});
type LimburgAddress = z.infer<typeof addressSchema>;

type Municipality = { nisCode: string; naam: string };
type Street = { nummer: string; naam: string };
type HouseNumber = { huisNummer: string; toevoeging: string | null };

export type LimburgCalendarResponse = {
  activiteitenLegende?: Record<string, { nummer?: string; omschrijving?: string }>;
  ophalingen?: {
    lijstVanOphaalDagen?: { datum?: string; activiteitCode?: string; displayCode?: number; displayReden?: string | null }[];
  };
};

/** Turns one month of the Limburg.net calendar into collections between `from` and `to`. */
export function parseLimburgCalendar(body: LimburgCalendarResponse, from: string, to: string): ProviderCollection[] {
  const legend = body.activiteitenLegende ?? {};
  const seen = new Set<string>();
  const collections: ProviderCollection[] = [];
  for (const day of body.ophalingen?.lijstVanOphaalDagen ?? []) {
    const date = day.datum?.slice(0, 10) ?? "";
    const code = day.activiteitCode ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !code || date < from || date > to) continue;
    const key = `${date}|${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = legend[code]?.omschrijving?.trim() || `Fractie ${code}`;
    collections.push({
      date,
      fraction: normaliseFraction(label),
      providerKey: code,
      label,
      color: null,
      note: day.displayReden?.trim() || null,
    });
  }
  return collections;
}

/** Every `YYYY-MM` from the month of `from` to the month of `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const value = `${year}-${String(month).padStart(2, "0")}`;
    if (value > last) break;
    months.push(value);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

const label = (address: LimburgAddress) =>
  `${address.street} ${address.houseNumber}${address.addition}, ${address.municipality}`;

async function lookup(input: WasteLookupInput): Promise<WasteLookupResult> {
  if (!input.municipality) return { matches: [], problem: "municipality" };
  const municipalities = await get<Municipality[]>("/afval-kalender/gemeenten/search", { query: input.municipality });
  const municipality =
    municipalities.find((candidate) => sameName(candidate.naam, input.municipality ?? "")) ??
    (municipalities.length === 1 ? municipalities[0] : undefined);
  if (!municipality) return { matches: [], problem: "municipality" };

  const streets = await get<Street[]>(`/afval-kalender/gemeente/${encodeURIComponent(municipality.nisCode)}/straten/search`, {
    query: input.street,
  });
  const exact = streets.filter((street) => sameName(street.naam, input.street));
  const candidates = (exact.length ? exact : streets).slice(0, 5);
  if (candidates.length === 0) return { matches: [], problem: "street" };

  const wanted = splitHouseNumber(input.number);
  const matches: WasteAddressMatch[] = [];
  for (const street of candidates) {
    const numbers = await get<HouseNumber[]>(`/afval-kalender/straat/${encodeURIComponent(street.nummer)}/huisnummers/search`, {
      query: wanted.number,
    });
    const sameNumber = numbers.filter((entry) => entry.huisNummer === wanted.number);
    const sameSuffix = sameNumber.filter((entry) => (entry.toevoeging ?? "").toUpperCase() === wanted.suffix);
    for (const entry of sameSuffix.length ? sameSuffix : sameNumber) {
      const address: LimburgAddress = {
        nisCode: municipality.nisCode,
        municipality: municipality.naam,
        streetId: street.nummer,
        street: street.naam,
        houseNumber: entry.huisNummer,
        addition: (entry.toevoeging ?? "").toUpperCase(),
      };
      matches.push({ label: label(address), address });
    }
  }
  return { matches: matches.slice(0, 10), problem: matches.length ? null : "number" };
}

async function fetchCollections(raw: Record<string, string>, from: string, to: string): Promise<ProviderCollection[]> {
  const address = addressSchema.parse(raw);
  const collections: ProviderCollection[] = [];
  // One request per month, one after the other: a few calls a day per household.
  for (const month of monthsBetween(from, to).slice(0, 7)) {
    const body = await get<LimburgCalendarResponse>(`/kalender/${encodeURIComponent(address.nisCode)}/${month}`, {
      straatNummer: address.streetId,
      huisNummer: address.houseNumber,
      toevoeging: address.addition,
    });
    collections.push(...parseLimburgCalendar(body, from, to));
  }
  return collections;
}

export const limburgNetProvider: WasteProvider = {
  info: {
    id: "limburg-net",
    name: "Limburg.net",
    website: "https://limburg.net/afvalkalender",
    postalCodeRanges: [[3500, 3999]],
    checksCoverage: false,
  },
  lookup,
  parseAddress(address) {
    const parsed = addressSchema.safeParse(address);
    return parsed.success ? parsed.data : null;
  },
  fetchCollections,
};
