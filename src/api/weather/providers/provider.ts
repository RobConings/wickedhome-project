import type { WeatherForecast, WeatherProviderInfo } from "@/features/weather/types/weather";
import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";

/**
 * A weather source. One file per provider in this folder, registered in `index.ts`. Adapters normalise
 * the provider's own codes and units to our contract (`@/features/weather/types/weather`).
 *
 * Rules: only the provider's fixed host(s) through `fetchJsonFromFixedHost` (timeouts, size caps); send
 * coordinates rounded to 2 decimals (~1 km); never log keys or coordinates; parsing is a pure, exported
 * function with a unit test against a trimmed real (or documented) response.
 */
export interface WeatherProvider {
  info: Omit<WeatherProviderInfo, "available" | "unavailableReason">;
  /** False when the server lacks what the provider needs (an API key). */
  isConfigured(): boolean;
  /** Throws `OutboundError` when the provider fails or answers something unusable. */
  fetchForecast(latitude: number, longitude: number): Promise<ProviderForecast>;
}

/** What an adapter returns; the service adds `provider`, `fallbackFrom` and `stale`. */
export type ProviderForecast = Omit<WeatherForecast, "provider" | "fallbackFrom" | "stale">;

/** Hours shown as "next hours" and days in the forecast. */
export const FORECAST_HOURS = 12;
export const FORECAST_DAYS = 7;

export const round1 = (value: number) => Math.round(value * 10) / 10;

/** A finite number, or `null` (accepts numeric strings, as KMI sends some). */
export function numberOrNull(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

/** An instant as local wall-clock time in the household time zone: `YYYY-MM-DDTHH:MM`. */
export function localDateTime(instant: string | Date): string | null {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: HOUSEHOLD_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
