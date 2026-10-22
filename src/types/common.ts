import { z } from "zod";

export const LOCALES = ["en", "nl"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const idSchema = z.string().min(1).max(64);

/** `#rrggbb` hex colour, used for habitants, rooms, calendar categories. */
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Calendar date without time, `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date();

/** Error body returned by the API for every non-2xx response. */
export type ApiError = {
  error: {
    code: string;
    message: string;
    /** Field-level validation messages, keyed by dotted path. */
    fields?: Record<string, string[]>;
  };
};
