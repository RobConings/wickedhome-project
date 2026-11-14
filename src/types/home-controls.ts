import { z } from "zod";

/** Controls offered by the server from the actual HA entity, never from a device icon/category. */
export const HA_CONTROL_ACTIONS = ["on", "off", "open", "close", "brightness", "position", "temperature", "mode", "preset", "operation", "volume", "mute", "unmute", "play", "pause", "stop", "next", "previous", "source"] as const;
export type HaControlAction = typeof HA_CONTROL_ACTIONS[number];
export const haControlInputSchema = z.object({
  entityId: z.string().min(1).max(255),
  action: z.enum(HA_CONTROL_ACTIONS),
  value: z.number().finite().optional(),
  option: z.string().min(1).max(150).optional(),
});
export type HaControl = { entityId: string; name: string; state: string; updatedAt: string | null;
  actions: HaControlAction[];
  adjustment: { action: "brightness" | "position" | "temperature" | "volume"; value: number | null; min: number; max: number; step: number; unit: string } | null;
  choices?: { action: "mode" | "preset" | "operation" | "source"; values: string[]; value: string | null }[];
};
export type HaDeviceControls = { connected: boolean; controls: HaControl[] };

export type HaControlInput = z.infer<typeof haControlInputSchema>;
