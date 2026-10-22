import { z } from "zod";
import { formatDate } from "@/types/date-format";
import { money } from "./compact";

/**
 * Argument helpers for the skills' tools (ai/skills/<skill>/tools.ts): euros instead of cents (models are
 * bad at cents), dates as YYYY-MM-DD, text in the person's language. Names of people, rooms… are
 * `entityRef(...)` (resolve.ts); result shaping is compact.ts. Everything is re-exported by kit.ts.
 */

/** An amount in euros as the model sends it (12.5) → integer cents with `toCents`. */
export const eurosSchema = z.number().positive().max(1_000_000).describe("Amount in euros, e.g. 12.5 for € 12,50");
export const toCents = (euros: number) => Math.round(euros * 100);

/** Cents → "€ 12,50" (Belgian notation), for confirmation texts. Same as `money`. */
export const formatEuro = (cents: number) => money(cents) ?? "";

/** Cents → euros as a number, where a result needs to compute with it (prefer `money` for reading). */
export const toEuros = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : Math.round(cents) / 100);

/** A `YYYY-MM-DD` date as the person reads it, via `@/types/date-format`: "vr 03/10/2026" / "Fri 03/10/2026". */
export function formatDay(date: string, locale: "en" | "nl"): string {
  return formatDate(date, locale, { weekday: "short" });
}

/** Picks the text for the person's language. */
export const say = (locale: "en" | "nl", en: string, nl: string) => (locale === "nl" ? nl : en);

/** A required date argument, YYYY-MM-DD. */
export const dateSchema = (description = "Date YYYY-MM-DD") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(description);

/** Optional date argument with a model-facing description. */
export const optionalDateSchema = (description: string) => dateSchema(description).optional();

/** A month argument, YYYY-MM. */
export const monthSchema = (description = "Month YYYY-MM") =>
  z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .describe(description);

/** A time argument, HH:MM (24 h, Brussels). */
export const timeSchema = (description = "HH:MM, 24-hour, Brussels time") =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .describe(description);
