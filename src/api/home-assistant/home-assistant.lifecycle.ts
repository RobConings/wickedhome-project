import { startJobNow } from "../jobs/job-scheduler";
import { startAlarmEvents } from "./ha-alarm";
import { startAlarmNotifications } from "./ha-notifications";
import { onStatesLoaded, startHomeAssistant, stopHomeAssistant } from "./ha-connection";
import { startDeviceSync } from "./ha-device-sync";
import { needsFirstImport } from "./ha-energy";
import { HA_ENERGY_JOB_ID } from "./home-assistant.jobs";

/**
 * Starts the Home Assistant integration with the server (server.ts, next to the job scheduler): the
 * WebSocket connection, the live device sync, alarm events, and the energy backfill after the first connect.
 * Does nothing visible until HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN are set.
 */
export function startHomeAssistantIntegration(): void {
  startDeviceSync();
  startAlarmEvents();
  // Alarm went off / armed / disarmed notifications (docs/NOTIFICATIONS.md).
  startAlarmNotifications();
  onStatesLoaded(() => {
    void needsFirstImport()
      .then((needed) => {
        if (!needed) return;
        console.log("[home-assistant] first connection: importing energy statistics");
        startJobNow(HA_ENERGY_JOB_ID);
      })
      .catch((error: Error) => console.warn("[home-assistant] could not start the first energy import:", error.message));
  });
  startHomeAssistant();
}

export async function stopHomeAssistantIntegration(): Promise<void> {
  await stopHomeAssistant();
}
