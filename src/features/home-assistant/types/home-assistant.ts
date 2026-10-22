import { z } from "zod";
import { idSchema } from "@/types/common";
import { canManageHousehold } from "@/types/roles";

// Home Assistant: the household's HA instance, reached by the server over its WebSocket API with a
// long-lived token from .env. Entities feed device values, energy statistics feed energy intervals, and
// the alarm panel (Verisure via HA) can be armed from the UI. See docs/INTEGRATIONS.md.

// Connection ------------------------------------------------------------------------------------------------

/** not_configured: no URL/token in .env · connecting: (re)connecting · connected · error: failed, retrying. */
export const HA_CONNECTION_STATES = ["not_configured", "connecting", "connected", "error"] as const;
export type HaConnectionState = (typeof HA_CONNECTION_STATES)[number];

/** Why the last attempt failed (translated in the UI). */
export const HA_ERROR_CODES = ["auth_invalid", "unreachable", "timeout", "protocol", "other_household"] as const;
export type HaErrorCode = (typeof HA_ERROR_CODES)[number];

export type HaConnectionStatus = {
  state: HaConnectionState;
  /** Origin of the configured instance (`http://192.168.1.10:8123`), never the token. */
  url: string | null;
  haVersion: string | null;
  entityCount: number;
  connectedAt: string | null;
  lastEventAt: string | null;
  errorCode: HaErrorCode | null;
  /** Technical detail of the last error, for the card's "details" line. Never contains the token. */
  errorMessage: string | null;
  nextRetryAt: string | null;
  /**
   * False when the instance serves another household (HOME_ASSISTANT_HOUSEHOLD_ID, or more than one
   * household without it): this household then sees "not configured".
   */
  linked: boolean;
};

export type HaTestResult = {
  ok: boolean;
  haVersion: string | null;
  entityCount: number;
  latencyMs: number | null;
  errorCode: HaErrorCode | null;
  errorMessage: string | null;
};

// Entities ---------------------------------------------------------------------------------------------------

export const haEntityIdSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^[a-z_]+\.[a-z0-9_]+$/, "Expected domain.object_id, e.g. binary_sensor.kitchen_window");

/** One entity as the browser sees it (attribute values are left out of the list). */
export type HaEntity = {
  entityId: string;
  domain: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
  area: string | null;
  /** Attribute names a device field can read instead of the state (`current_temperature`). */
  attributeKeys: string[];
  lastChangedAt: string | null;
  lastUpdatedAt: string | null;
};

export type HaEntitiesResponse = {
  status: HaConnectionStatus;
  entities: HaEntity[];
};

// Device import ------------------------------------------------------------------------------------------------

/** Presets "Import from Home Assistant" can create devices with (src/features/devices/types/device-presets.ts). */
export const HA_IMPORT_PRESETS = ["contact", "climate", "laundry", "alarm_panel", "motion", "alarm_component", "light"] as const;
export type HaImportPreset = (typeof HA_IMPORT_PRESETS)[number];

export type HaDeviceSuggestion = {
  entityId: string;
  name: string;
  area: string | null;
  state: string;
  unit: string | null;
  presetKey: HaImportPreset;
  /** The profile field the entity is bound to. */
  fieldKey: string;
  /** True when a device field is already bound to this entity. */
  alreadyBound: boolean;
};

export type HaSuggestionsResponse = {
  status: HaConnectionStatus;
  suggestions: HaDeviceSuggestion[];
};

export const haImportInputSchema = z.object({
  items: z
    .array(
      z.object({
        entityId: haEntityIdSchema,
        name: z.string().trim().min(1).max(60),
        presetKey: z.enum(HA_IMPORT_PRESETS),
        placeId: idSchema.nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type HaImportInput = z.infer<typeof haImportInputSchema>;

export type HaImportResult = { created: number; deviceIds: string[] };

// Alarm ------------------------------------------------------------------------------------------------------

/** Home Assistant alarm_control_panel states. */
export const ALARM_STATES = [
  "disarmed",
  "armed_home",
  "armed_away",
  "armed_night",
  "armed_vacation",
  "armed_custom_bypass",
  "arming",
  "pending",
  "disarming",
  "triggered",
  "unavailable",
  "unknown",
] as const;
export type AlarmState = (typeof ALARM_STATES)[number];

export const toAlarmState = (raw: string | null | undefined): AlarmState =>
  (ALARM_STATES as readonly string[]).includes(raw ?? "") ? (raw as AlarmState) : "unknown";

export const ALARM_ACTIONS = ["arm_home", "arm_away", "disarm"] as const;
export type AlarmActionKind = (typeof ALARM_ACTIONS)[number];

export const ALARM_ACTION_RESULTS = ["succeeded", "failed", "refused", "rate_limited"] as const;
export type AlarmActionResultKind = (typeof ALARM_ACTION_RESULTS)[number];

/**
 * Who may trigger which alarm action, and how. The assistant's tool registry must read this: arming is a
 * sensitive tool that always asks for confirmation; **disarming is never a tool** (not for the assistant,
 * MCP or voice). The API enforces the same (`assertAlarmActionAllowed`).
 */
export const ALARM_ACTION_POLICY = {
  arm_home: { assistantAllowed: true, permission: "sensitive", confirmation: "always" },
  arm_away: { assistantAllowed: true, permission: "sensitive", confirmation: "always" },
  disarm: { assistantAllowed: false, permission: "sensitive", confirmation: "code" },
} as const satisfies Record<AlarmActionKind, { assistantAllowed: boolean; permission: "sensitive"; confirmation: "always" | "code" }>;

export type AlarmPanel = {
  entityId: string;
  name: string;
  state: AlarmState;
  /** Home Assistant wants the code for arming too (`code_arm_required`). */
  codeArmRequired: boolean;
  /** `number` → numeric keypad, `text`, or null when the panel takes no code. */
  codeFormat: "number" | "text" | null;
  supportsArmHome: boolean;
  supportsArmAway: boolean;
  changedAt: string | null;
};

export type AlarmHistoryEntry = { state: AlarmState; at: string };

export type AlarmLogEntry = {
  id: string;
  actorName: string;
  action: AlarmActionKind;
  result: AlarmActionResultKind;
  detail: string | null;
  at: string;
};

export type AlarmOverview = {
  status: HaConnectionStatus;
  /** The chosen (or only) panel; null when HA has none or isn't connected. */
  panel: AlarmPanel | null;
  /** Every alarm panel Home Assistant has, to pick one in the settings. */
  panels: { entityId: string; name: string }[];
  /** State changes of the last 7 days, newest first. */
  history: AlarmHistoryEntry[];
  /** The latest actions from the UI (owners and adults only; empty for children). */
  log: AlarmLogEntry[];
};

/** Arming always needs `confirm: true` (the confirmation dialog); a code only when the panel asks for it. */
export const alarmArmInputSchema = z.object({
  mode: z.enum(["home", "away"]),
  confirm: z.literal(true),
  code: z.string().trim().min(1).max(32).optional(),
});
export type AlarmArmInput = z.infer<typeof alarmArmInputSchema>;

/** Disarming always needs the code. It is sent to Home Assistant and never stored or logged. */
export const alarmDisarmInputSchema = z.object({ code: z.string().trim().min(1).max(32) });
export type AlarmDisarmInput = z.infer<typeof alarmDisarmInputSchema>;

export type AlarmActionResponse = { ok: boolean; state: AlarmState | null };

/** Armed in any mode (for the card's tone and wording). */
export const isArmed = (state: AlarmState) => state.startsWith("armed_");

// Energy -----------------------------------------------------------------------------------------------------

export type HaEnergyKind = "grid_import" | "grid_export" | "solar_production" | "battery_charge" | "battery_discharge" | "appliance";

/** A statistic from Home Assistant's energy dashboard (`energy/get_prefs`) and what it is imported as. */
export type HaEnergySource = {
  statisticId: string;
  kind: HaEnergyKind;
  carrier: "electricity" | "gas";
  register: "single" | "day" | "night";
  intervalCount: number;
  lastAt: string | null;
};

export type HaDeviceConsumption = {
  statisticId: string;
  name: string | null;
  /** The statistic of another device this one is part of (HA's `included_in_stat`). */
  includedIn: string | null;
  applianceId: string | null;
  intervalCount: number;
  lastAt: string | null;
};

export type HaEnergyOverview = {
  status: HaConnectionStatus;
  enabled: boolean;
  backfillDays: number;
  lastImportAt: string | null;
  lastResult: string | null;
  /** Null when the preferences couldn't be read (not connected, energy dashboard not set up). */
  sources: HaEnergySource[] | null;
  devices: HaDeviceConsumption[];
};

export const haApplianceLinksInputSchema = z.object({
  links: z
    .array(z.object({ statisticId: z.string().trim().min(3).max(255), applianceId: idSchema.nullable() }))
    .max(100),
});
export type HaApplianceLinksInput = z.infer<typeof haApplianceLinksInputSchema>;

export const haSettingsInputSchema = z.object({
  alarmEntityId: haEntityIdSchema.nullable().optional(),
  energyImportEnabled: z.boolean().optional(),
  energyBackfillDays: z.number().int().min(1).max(730).optional(),
});
export type HaSettingsInput = z.infer<typeof haSettingsInputSchema>;

/** Owners and adults bind entities, import devices, link statistics and use the alarm; children look. */
export const canManageHomeAssistant = canManageHousehold;

// Live events ----------------------------------------------------------------------------------------------

/** `home_assistant.status`: the connection state changed. */
export const HA_STATUS_EVENT = "home_assistant.status";
/** `alarm.state`: the alarm panel changed state (data: `{ entityId, state, at }`). */
export const ALARM_STATE_EVENT = "alarm.state";
export type AlarmStateEvent = { entityId: string; state: AlarmState; at: string };
