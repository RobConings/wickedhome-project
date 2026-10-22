import { registerJob } from "../jobs/job-registry";
import { refreshBoundStates } from "./ha-device-sync";
import { getHaClient, isHomeAssistantConfigured } from "./ha-connection";
import { importHomeAssistantEnergy } from "./ha-energy";

export const HA_ENERGY_JOB_ID = "home-assistant.energy";

/**
 * Hourly at :07 (Home Assistant compiles the hourly statistics a few minutes after the hour), plus once after a
 * restart that missed it. The first run after connecting backfills `energyBackfillDays`. Not configured → a
 * quiet no-op; configured but unreachable → a failed run, so it shows under Automations.
 */
registerJob({
  id: HA_ENERGY_JOB_ID,
  schedule: "7 * * * *",
  titleKey: "home-assistant:jobs.energy.title",
  descriptionKey: "home-assistant:jobs.energy.description",
  runOnStartupIfMissed: true,
  timeoutMs: 15 * 60 * 1000,
  run: async ({ signal, log }) => {
    if (!isHomeAssistantConfigured()) return { summary: "Home Assistant is not configured" };
    const { summary } = await importHomeAssistantEnergy({ signal, log });
    return { summary };
  },
});

/**
 * Every 15 minutes: re-applies bound entity states that Home Assistant reported again without a change, so
 * a steady sensor isn't shown as "no recent data". Live changes don't wait for this (state_changed events).
 */
registerJob({
  id: "home-assistant.refresh-states",
  schedule: "*/15 * * * *",
  titleKey: "home-assistant:jobs.refreshStates.title",
  descriptionKey: "home-assistant:jobs.refreshStates.description",
  run: async () => {
    if (!isHomeAssistantConfigured()) return { summary: "Home Assistant is not configured" };
    if (!getHaClient()?.connected) throw new Error("Home Assistant is not connected");
    const { checked, updated } = await refreshBoundStates();
    return { summary: `${checked} bound fields checked, ${updated} refreshed` };
  },
});
