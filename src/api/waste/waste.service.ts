import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import {
  WASTE_FRACTION_COLORS,
  compareWasteCollections,
  suggestWasteProvider,
  wasteDayTitle,
  type WasteDay,
  type WasteFraction,
  type WasteLookupInput,
  type WasteLookupResult,
  type WasteProviderId,
  type WasteSettings,
  type WasteSetup,
  type WasteSetupInput,
  type WasteSummary,
  type WasteTaskSettingsInput,
} from "@/features/waste/types/waste";
import { addDays, todayIn } from "@/types/dates";
import { db, type WasteFraction as WasteFractionRow, type WasteSetup as WasteSetupRow } from "../lib/db";
import { OutboundError } from "../lib/fixed-host-fetch";
import { badRequest, notFound } from "../lib/http";
import { wasteProvider, wasteProviderInfos, type ProviderCollection } from "./providers";
import { fromTiming, syncWasteTasks, wasteTaskSettingsOf, type WasteTaskSyncResult } from "./waste-tasks";

/** The window every sync replaces: a week back (late changes) to four months ahead. */
export const SYNC_PAST_DAYS = 7;
export const SYNC_FUTURE_DAYS = 120;
/** Collections older than this are pruned on sync. */
const KEEP_DAYS = 400;

const toFraction = (fraction: WasteFractionRow) => fraction.toLowerCase() as WasteFraction;
const fromFraction = (fraction: WasteFraction) => fraction.toUpperCase() as WasteFractionRow;
const dateValue = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString() ?? null;

function toSetup(row: WasteSetupRow): WasteSetup {
  return {
    providerId: row.providerId as WasteProviderId,
    providerName: wasteProvider(row.providerId)?.info.name ?? row.providerId,
    addressLabel: row.addressLabel,
    lastSyncAt: iso(row.lastSyncAt),
    lastSyncStatus: row.lastSyncStatus ? (row.lastSyncStatus.toLowerCase() as WasteSetup["lastSyncStatus"]) : null,
    lastSyncError: row.lastSyncError,
    lastSuccessAt: iso(row.lastSuccessAt),
    tasks: wasteTaskSettingsOf(row),
  };
}

type CollectionRow = { date: Date; fraction: WasteFractionRow; label: string; color: string | null; note: string | null };

/** Groups collection rows into days, sorted by date and, within a day, by fraction. */
export function groupWasteDays(rows: CollectionRow[]): WasteDay[] {
  const days = new Map<string, WasteDay>();
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    const fraction = toFraction(row.fraction);
    const day = days.get(date) ?? { date, collections: [] };
    day.collections.push({ fraction, label: row.label, color: row.color ?? WASTE_FRACTION_COLORS[fraction], note: row.note });
    days.set(date, day);
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ ...day, collections: day.collections.sort(compareWasteCollections) }));
}

export async function getWasteDays(householdId: string, from: string, to: string, limitDays?: number): Promise<WasteDay[]> {
  const rows = await db.wasteCollection.findMany({
    where: { householdId, date: { gte: dateValue(from), lte: dateValue(to) } },
    orderBy: [{ date: "asc" }],
    select: { date: true, fraction: true, label: true, color: true, note: true },
  });
  const days = groupWasteDays(rows);
  return limitDays === undefined ? days : days.slice(0, limitDays);
}

export async function getWasteSettings(householdId: string): Promise<WasteSettings> {
  const [setup, household] = await Promise.all([
    db.wasteSetup.findUnique({ where: { householdId } }),
    db.household.findUniqueOrThrow({ where: { id: householdId }, select: { addressPostalCode: true } }),
  ]);
  const providers = wasteProviderInfos();
  const today = todayIn();
  return {
    setup: setup ? toSetup(setup) : null,
    providers,
    suggestedProviderId: suggestWasteProvider(household.addressPostalCode, providers),
    upcoming: setup ? await getWasteDays(householdId, today, addDays(today, 60), 4) : [],
  };
}

export async function getWasteSummary(householdId: string): Promise<WasteSummary> {
  const setup = await db.wasteSetup.findUnique({ where: { householdId } });
  if (!setup) return { setup: null, upcoming: [] };
  const today = todayIn();
  return { setup: toSetup(setup), upcoming: await getWasteDays(householdId, today, addDays(today, 42), 3) };
}

export async function lookupWasteAddress(input: WasteLookupInput): Promise<WasteLookupResult> {
  const provider = wasteProvider(input.providerId);
  if (!provider) throw badRequest("Unknown provider");
  try {
    return await provider.lookup(input);
  } catch (error) {
    if (!(error instanceof OutboundError)) throw error;
    console.warn(`Waste lookup (${input.providerId}): ${error.message}`);
    return { matches: [], problem: "provider_error" };
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────────────────────────────────

const running = new Map<string, Promise<WasteSetup>>();

/**
 * Replaces the household's collections in the sync window with what the provider reports, atomically.
 * Running it twice gives the same result. A provider failure (or a suspicious empty answer) keeps the
 * stored collections and records the error on the setup.
 */
async function runSync(householdId: string): Promise<WasteSetup> {
  const setup = await db.wasteSetup.findUnique({ where: { householdId } });
  if (!setup) throw notFound("No waste collector set up");
  const provider = wasteProvider(setup.providerId);
  const address = provider?.parseAddress(setup.address) ?? null;

  const today = todayIn();
  const from = addDays(today, -SYNC_PAST_DAYS);
  const to = addDays(today, SYNC_FUTURE_DAYS);
  let collections: ProviderCollection[] | null = null;
  let error: string | null = null;
  if (!provider || !address) {
    error = "Stored address no longer fits this provider; set it up again";
  } else {
    try {
      collections = await provider.fetchCollections(address, from, to);
    } catch (caught) {
      error = caught instanceof OutboundError ? caught.message : "Unexpected answer from the provider";
      if (!(caught instanceof OutboundError)) console.error(`Waste sync (${setup.providerId}) failed`, caught);
      else console.warn(`Waste sync (${setup.providerId}): ${caught.message}`);
    }
  }

  const window = { householdId, date: { gte: dateValue(from), lte: dateValue(to) } };
  if (collections && collections.length === 0 && (await db.wasteCollection.count({ where: window })) > 0) {
    // A collector never stops collecting overnight: keep what we have rather than emptying the calendar.
    collections = null;
    error = "The provider returned no collections; keeping the previous ones";
  }

  const now = new Date();
  if (collections) {
    const rows = collections;
    const [, , updated] = await db.$transaction([
      db.wasteCollection.deleteMany({ where: window }),
      db.wasteCollection.createMany({
        data: rows.map((collection) => ({
          householdId,
          date: dateValue(collection.date),
          fraction: fromFraction(collection.fraction),
          providerKey: collection.providerKey,
          label: collection.label.slice(0, 120),
          color: collection.color,
          note: collection.note?.slice(0, 300) ?? null,
        })),
        skipDuplicates: true,
      }),
      db.wasteSetup.update({
        where: { householdId },
        data: { lastSyncAt: now, lastSyncStatus: "OK", lastSyncError: null, lastSuccessAt: now },
      }),
      db.wasteCollection.deleteMany({ where: { householdId, date: { lt: dateValue(addDays(today, -KEEP_DAYS)) } } }),
    ]);
    return toSetup(updated);
  }
  const updated = await db.wasteSetup.update({
    where: { householdId },
    data: { lastSyncAt: now, lastSyncStatus: "ERROR", lastSyncError: error?.slice(0, 300) ?? "Sync failed" },
  });
  return toSetup(updated);
}

/**
 * Keeps the bins tasks in step with the stored collections and the setting. Never fails a sync: a problem
 * is logged and the next sync tries again.
 */
export async function refreshWasteTasks(householdId: string): Promise<WasteTaskSyncResult | null> {
  try {
    return await syncWasteTasks(householdId, (from, to) => getWasteDays(householdId, from, to));
  } catch (error) {
    console.error("Waste tasks: sync failed", error);
    return null;
  }
}

/** Syncs one household (collections, then its bins tasks); concurrent calls for the same household share one run. */
export function syncWaste(householdId: string): Promise<WasteSetup> {
  const current = running.get(householdId);
  if (current) return current;
  const promise = runSync(householdId)
    .then(async (setup) => {
      // Also after a failed fetch: the stored collections still decide the tasks (e.g. a new day dawned).
      await refreshWasteTasks(householdId);
      return setup;
    })
    .finally(() => running.delete(householdId));
  running.set(householdId, promise);
  return promise;
}

/** Saves the collector and its address (from a lookup match), then syncs right away. */
export async function saveWasteSetup(householdId: string, input: WasteSetupInput): Promise<WasteSetup> {
  const provider = wasteProvider(input.providerId);
  const address = provider?.parseAddress(input.address);
  if (!provider || !address) throw badRequest("This address doesn't fit the provider", { address: ["invalid"] });

  const existing = await db.wasteSetup.findUnique({ where: { householdId } });
  const changed =
    !existing || existing.providerId !== input.providerId || JSON.stringify(existing.address) !== JSON.stringify(address);
  const data = { providerId: input.providerId, address, addressLabel: input.label };
  await db.$transaction([
    // Another collector or address: its old collections no longer apply.
    ...(changed ? [db.wasteCollection.deleteMany({ where: { householdId } })] : []),
    db.wasteSetup.upsert({
      where: { householdId },
      create: { householdId, ...data },
      update: changed ? { ...data, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, lastSuccessAt: null } : data,
    }),
  ]);
  return syncWaste(householdId);
}

export async function deleteWasteSetup(householdId: string): Promise<void> {
  await db.$transaction([
    db.wasteCollection.deleteMany({ where: { householdId } }),
    db.wasteSetup.deleteMany({ where: { householdId } }),
  ]);
  // Without a collector, open bins tasks go too (done ones stay in the history).
  await refreshWasteTasks(householdId);
}

/** Saves the bins-task setting and applies it to the open bins tasks right away. */
export async function saveWasteTaskSettings(householdId: string, input: WasteTaskSettingsInput): Promise<WasteSetup> {
  const setup = await db.wasteSetup.findUnique({ where: { householdId } });
  if (!setup) throw notFound("No waste collector set up");
  const assigneeIds = [...new Set(input.assigneeIds)];
  if (assigneeIds.length > 0) {
    const found = await db.habitant.count({ where: { householdId, id: { in: assigneeIds } } });
    if (found !== assigneeIds.length) throw badRequest("Validation failed", { assigneeIds: ["unknownHabitant"] });
  }
  const updated = await db.wasteSetup.update({
    where: { householdId },
    data: { taskEnabled: input.enabled, taskTiming: fromTiming(input.timing), taskAssigneeIds: assigneeIds, taskRotate: input.rotate },
  });
  await refreshWasteTasks(householdId);
  return toSetup(updated);
}

// ── Daily sync (job `waste.sync`, waste.jobs.ts) ──────────────────────────────────────────────────────

/**
 * Syncs every household that has a waste setup, one after the other, and returns a short summary and the
 * number of failed setups. Run daily by the `waste.sync` job; safe with zero setups and idempotent.
 */
export async function syncAllWasteSetups(context?: {
  signal?: AbortSignal;
  log?: (message: string) => void;
}): Promise<{ summary: string; failed: number }> {
  const setups = await db.wasteSetup.findMany({ select: { householdId: true } });
  let ok = 0;
  let failed = 0;
  for (const { householdId } of setups) {
    if (context?.signal?.aborted) break;
    try {
      const result = await syncWaste(householdId);
      if (result.lastSyncStatus === "ok") ok += 1;
      else {
        failed += 1;
        context?.log?.(`${result.providerName}: ${result.lastSyncError ?? "sync failed"}`);
      }
    } catch (error) {
      failed += 1;
      context?.log?.(error instanceof Error ? error.message : "sync failed");
    }
  }
  const summary =
    setups.length === 0 ? "No waste collector set up" : `${ok} of ${setups.length} synced${failed ? `, ${failed} failed` : ""}`;
  return { summary, failed };
}

// ── Calendar ──────────────────────────────────────────────────────────────────────────────────────────

/** Collection days as read-only, all-day calendar items: one per day, titled "PMD + Papier & karton". */
export function wasteCalendarItems(days: WasteDay[]): CalendarOverlayItem[] {
  return days.map((day) => ({
    id: day.date,
    kind: "waste",
    title: wasteDayTitle(day.collections),
    allDay: true,
    start: day.date,
    color: day.collections.length === 1 ? (day.collections[0]?.color ?? null) : null,
    href: "/settings#waste",
    meta: { fractions: day.collections.map((collection) => collection.fraction).join(",") },
  }));
}

export async function loadWasteCalendarItems(householdId: string, from: string, to: string): Promise<CalendarOverlayItem[]> {
  return wasteCalendarItems(await getWasteDays(householdId, from, to));
}
