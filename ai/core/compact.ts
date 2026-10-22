import { formatDate } from "@/types/date-format";
import type { Locale } from "@/types/common";

/**
 * Compact tool results: what a tool returns is read by a small local model with a ~16k context, so every
 * result is short and shaped the same way.
 *
 * - Only the fields a follow-up needs; ids only where the model may act on the thing next.
 * - Money for reading as text: `money(cents)` → "€ 1.234,56" (never cents, never floats like 1234.5).
 * - Dates in data as `YYYY-MM-DD`; in text as dd/mm/yyyy via `day(date, locale)`.
 * - Lists capped: `capList(items, 20, map)` → `{ items, more: 37 }` ("and 37 more").
 * - Writes answer with `done(text, { id })`: one sentence of what happened, plus the id for a follow-up.
 * - `null`, `undefined` and empty strings are dropped before the result goes to the model (`prune`).
 */

const EURO = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Integer cents → "€ 1.234,56" (Belgian notation; negative amounts "-€ 12,50"). */
export function money(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return null;
  const text = `€ ${EURO.format(Math.abs(cents) / 100)}`;
  return cents < 0 ? `-${text}` : text;
}

/** A `YYYY-MM-DD` date (or ISO instant) as dd/mm/yyyy, optionally with the weekday ("za 04/10/2026"). */
export function day(date: string | null | undefined, locale: Locale = "en", weekday = false): string | null {
  if (!date) return null;
  return formatDate(date, locale, weekday ? { weekday: "short" } : {});
}

/** At most `limit` items (mapped), and how many were left out. */
export function capList<T, R = T>(items: readonly T[], limit: number, map?: (item: T, index: number) => R): { items: R[]; more?: number } {
  const shown = items.slice(0, limit).map((item, index) => (map ? map(item, index) : (item as unknown as R)));
  return items.length > limit ? { items: shown, more: items.length - limit } : { items: shown };
}

/** The answer of a write: what happened in one sentence, plus what a follow-up needs (an id). */
export const done = <T extends Record<string, unknown>>(text: string, extra?: T) => ({ done: text, ...(extra ?? {}) });

/** Lines of text, skipping empty ones: for results that read best as a few lines. */
export const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n");

/** Drops `null`, `undefined` and `""` values (deeply); keeps `false`, `0` and empty lists (they mean "none"). */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined || item === "") continue;
      out[key] = prune(item);
    }
    return out;
  }
  return value;
}

/** Rounds a number for reading (kWh, m², percentages). */
export const round = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
