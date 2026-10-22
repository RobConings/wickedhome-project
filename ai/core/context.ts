import type { Role } from "@/features/auth/types/auth";
import { addDays, HOUSEHOLD_TIME_ZONE, todayIn } from "@/types/dates";
import type { AssistantToolContext } from "./tools";

/**
 * The household snapshot in the system prompt: a few short lines (people and roles, accounts, rooms per
 * floor…) so the model knows the names without a tool call. Skills contribute lines; the snapshot is cached
 * per person for 5 minutes and dropped after every write through the assistant.
 *
 *   registerAssistantContext({
 *     id: "people", order: 10,
 *     build: async (ctx) => `People: ${habitants.map(…).join(", ")}`,     // one line, or null for nothing
 *   });
 *
 * Keep each line under ~60 tokens: it is part of every request.
 */

export type AssistantContextProvider = {
  id: string;
  /** Lower comes first (people 10, places 20, money 30…). */
  order: number;
  roles?: readonly Role[];
  build: (ctx: AssistantToolContext) => Promise<string | null> | string | null;
};

const providers = new Map<string, AssistantContextProvider>();

export const registerAssistantContext = (provider: AssistantContextProvider) => void providers.set(provider.id, provider);
export const listAssistantContextProviders = () => [...providers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
/** Tests only. */
export const unregisterAssistantContext = (id: string) => providers.delete(id);

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; text: Promise<string> }>();

export function invalidateAssistantContext(householdId?: string): void {
  if (!householdId) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(`${householdId}:`)) cache.delete(key);
}

async function buildLines(ctx: AssistantToolContext): Promise<string> {
  const lines = await Promise.all(
    listAssistantContextProviders()
      .filter((provider) => !provider.roles || provider.roles.includes(ctx.user.role))
      .map(async (provider) => {
        try {
          return (await provider.build(ctx))?.trim() || null;
        } catch (error) {
          console.error(`Assistant context "${provider.id}" failed`, error);
          return null;
        }
      }),
  );
  return lines.filter(Boolean).join("\n");
}

/** The skills' snapshot lines for this person (cached unless `fresh`). */
export function householdSnapshot(ctx: AssistantToolContext, options: { fresh?: boolean } = {}): Promise<string> {
  const key = `${ctx.householdId}:${ctx.user.id}:${ctx.locale}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const text = buildLines(ctx);
  cache.set(key, { at: Date.now(), text });
  text.catch(() => cache.delete(key));
  return text;
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const LONG_WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" });
const weekdayOf = (date: string, format = WEEKDAY) => format.format(new Date(`${date}T12:00:00Z`));

/**
 * Today and the coming week as the model needs them to fill in dates without arithmetic:
 * "Today: Sunday 2026-10-04 (04/10/2026). Next days: Mon 2026-10-05, Tue 2026-10-06, …".
 * Changes once a day, so it doesn't break the model server's prompt cache during the day. (Gemma 4 still
 * counted weekdays itself with this list here; a question naming a weekday gets the dates next to it too,
 * assistant-prompt `questionNoteFor`.)
 */
export function dateLines(now: Date = new Date()): string {
  const today = todayIn(HOUSEHOLD_TIME_ZONE, now);
  const [year, month, dayOfMonth] = today.split("-");
  const next = Array.from({ length: 7 }, (_, index) => addDays(today, index + 1)).map((date) => `${weekdayOf(date)} ${date}`);
  return `Today: ${weekdayOf(today, LONG_WEEKDAY)} ${today} (${dayOfMonth}/${month}/${year}), time zone ${HOUSEHOLD_TIME_ZONE}. Next days: ${next.join(", ")}.`;
}

/** The wall-clock time in Brussels, "14:05" (sent with the question, not in the cached system prompt). */
export const clockTime = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: HOUSEHOLD_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
