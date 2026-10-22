import type {
  WasteFraction,
  WasteLookupInput,
  WasteLookupResult,
  WasteProviderInfo,
} from "@/features/waste/types/waste";

/**
 * A waste collector (or a platform that serves several): how to find the home at that provider and how
 * to fetch its collection days. One file per provider in this folder, registered in `index.ts`.
 * See docs/WASTE-WEATHER.md ("Adding a provider").
 *
 * Rules for adapters:
 * - only call the provider's own fixed host(s), through `fetchJsonFromFixedHost` (timeouts, size caps);
 * - never log the address (it is personal data); error messages stay generic;
 * - parsing is a pure, exported function with a unit test against a trimmed real response.
 */
export interface WasteProvider {
  info: WasteProviderInfo;

  /** Finds the address at the provider. No matches is not an error: say which step failed in `problem`. */
  lookup(input: WasteLookupInput): Promise<WasteLookupResult>;

  /**
   * Validates the stored address identifiers (from a lookup match, kept as JSON in the database).
   * Returns `null` when they don't fit this provider.
   */
  parseAddress(address: unknown): Record<string, string> | null;

  /** Collections between `from` and `to` (inclusive, `YYYY-MM-DD`). Throws `OutboundError` when the provider fails. */
  fetchCollections(address: Record<string, string>, from: string, to: string): Promise<ProviderCollection[]>;
}

/** One fraction on one day, as the provider reports it, already normalised. */
export type ProviderCollection = {
  date: string;
  fraction: WasteFraction;
  /** Stable key of the fraction at this provider (activity code, fraction id). */
  providerKey: string;
  label: string;
  /** `#rrggbb` or `null`. */
  color: string | null;
  note: string | null;
};

/** "100A" → `{ number: "100", suffix: "A" }`; "12-14" stays one number. */
export function splitHouseNumber(value: string): { number: string; suffix: string } {
  const match = value.trim().match(/^(\d+)\s*([a-zA-Z]{0,3})$/);
  if (!match) return { number: value.trim(), suffix: "" };
  return { number: match[1] ?? value.trim(), suffix: (match[2] ?? "").toUpperCase() };
}

/** Case-, accent- and punctuation-insensitive comparison of street and place names. */
export const sameName = (a: string, b: string) => {
  const simplify = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  return simplify(a) === simplify(b);
};

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
