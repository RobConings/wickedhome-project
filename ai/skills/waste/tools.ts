import { z } from "zod";
import { addDays, todayIn } from "@/types/dates";
import { getWasteDays, getWasteSummary, syncWaste } from "@/api/waste/waste.service";
import { done, registerAssistantSkill, registerAssistantTool, say } from "@ai/core/kit";
import { formatDateTime } from "@/types/date-format";

/** Skill "waste": waste collection days (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "waste",
  title: { en: "Waste collection", nl: "Afvalophaling" },
  summary: "Waste collection days: which bins go out when (PMD, paper, residual, GFT…).",
  keywords: {
    nl: ["afval", "vuilnis", "vuilbak", "container", "pmd", "papier", "karton", "restafval", "gft", "glas", "ophaling", "buitenzetten", "kliko"],
    en: ["waste", "trash", "garbage", "rubbish", "bin", "recycling", "collection", "paper", "glass"],
  },
});

registerAssistantTool({
  name: "waste.next_collection",
  description: "The next waste collection days (which bins: PMD, paper, residual waste, GFT…). For 'which bin goes out tonight'.",
  input: z.object({
    days: z.number().int().min(1).max(42).default(14).describe("How many days ahead, default 14"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the waste collection", nl: "Afvalophaling bekeken" },
  run: async (ctx, input) => {
    const summary = await getWasteSummary(ctx.householdId);
    if (!summary.setup) return { configured: false, hint: "Waste collection is not set up yet (Settings → Waste collection)." };
    const today = todayIn();
    const days = await getWasteDays(ctx.householdId, today, addDays(today, input.days), 6);
    const { lastSuccessAt, lastSyncStatus } = summary.setup;
    return {
      collector: summary.setup.providerName,
      updated: lastSuccessAt ? formatDateTime(lastSuccessAt, ctx.locale) : null,
      lastFetchFailed: lastSyncStatus === "error" || null,
      days: days.map((entry) => ({ date: entry.date, bins: entry.collections.map((collection) => collection.label) })),
    };
  },
});

registerAssistantTool({
  name: "waste.refresh",
  description: "Fetch the collection calendar again now (it also updates by itself every day).",
  input: z.object({}),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Refreshed the waste calendar", nl: "Afvalkalender vernieuwd" },
  describe: (ctx) => say(ctx.locale, "Fetch the waste collection calendar again", "De afvalkalender opnieuw ophalen"),
  run: async (ctx) => {
    const summary = await getWasteSummary(ctx.householdId);
    if (!summary.setup) return { ok: false, error: "Waste collection is not set up yet (Settings → Waste collection)." };
    const setup = await syncWaste(ctx.householdId);
    return setup.lastSyncStatus === "error" ? { ok: false, error: "The collection calendar could not be fetched; the stored days stay." } : done("The waste calendar is up to date.");
  },
});
