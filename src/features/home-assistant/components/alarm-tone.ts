import type { AlarmState } from "../types/home-assistant";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Same colours as the alarm panel preset on the floor plan: armed away info, armed home warning, triggered danger. */
export function alarmTone(state: AlarmState): Tone {
  switch (state) {
    case "triggered":
      return "danger";
    case "armed_away":
    case "armed_vacation":
      return "info";
    case "armed_home":
    case "armed_night":
    case "armed_custom_bypass":
    case "arming":
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}
