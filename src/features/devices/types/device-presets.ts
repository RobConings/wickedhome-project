import type { DeviceCategory, DeviceField, DeviceIconKey, DevicePresetSummary, DeviceProfileData, IndicatorRule } from "./devices";

// Ready-made profiles. Applying a preset creates a normal, editable profile in the user's language;
// afterwards the profile no longer depends on the preset.

type Locale = "en" | "nl";
type Text = Record<Locale, string>;

type PresetField = Omit<DeviceField, "label" | "trueLabel" | "falseLabel" | "choices"> & {
  label: Text;
  trueLabel?: Text;
  falseLabel?: Text;
  choices?: { value: string; label: Text }[];
};
type PresetRule = Omit<IndicatorRule, "label" | "pulse"> & { label: Text; pulse?: boolean };

type Preset = {
  key: string;
  name: Text;
  description: Text;
  icon: DeviceIconKey;
  category: DeviceCategory;
  fields: PresetField[];
  primaryField: string | null;
  rules: PresetRule[];
  fallbackLabel?: Text;
  staleAfterMinutes: number | null;
};

const battery: PresetField = { key: "battery", label: { en: "Battery", nl: "Batterij" }, type: "number", unit: "%" };

const ALARM_STATES = {
  disarmed: { en: "Disarmed", nl: "Uitgeschakeld" },
  armed_home: { en: "Armed (home)", nl: "Ingeschakeld (thuis)" },
  armed_away: { en: "Armed (away)", nl: "Ingeschakeld (afwezig)" },
  triggered: { en: "Triggered", nl: "Alarm gaat af" },
} satisfies Record<string, Text>;

export const DEVICE_PRESETS: readonly Preset[] = [
  {
    key: "contact",
    name: { en: "Window/door contact", nl: "Raam-/deurcontact" },
    description: { en: "Open or closed, with an optional battery level.", nl: "Open of dicht, met optioneel het batterijniveau." },
    icon: "window",
    category: "sensor",
    fields: [
      {
        key: "isOpen",
        label: { en: "Open", nl: "Open" },
        type: "boolean",
        trueLabel: { en: "Open", nl: "Open" },
        falseLabel: { en: "Closed", nl: "Dicht" },
      },
      battery,
    ],
    primaryField: "isOpen",
    rules: [
      { id: "open", field: "isOpen", operator: "is_true", tone: "danger", label: { en: "Open", nl: "Open" }, icon: "window" },
      { id: "closed", field: "isOpen", operator: "is_false", tone: "success", label: { en: "Closed", nl: "Dicht" } },
    ],
    // Contacts only report changes, so a window that stays shut for days is not stale.
    staleAfterMinutes: null,
  },
  {
    key: "climate",
    name: { en: "Temperature & humidity", nl: "Temperatuur & vochtigheid" },
    description: { en: "Room climate: cold below 18 °C, comfortable up to 24 °C, warm above.", nl: "Binnenklimaat: koud onder 18 °C, aangenaam tot 24 °C, warm daarboven." },
    icon: "thermometer",
    category: "climate",
    fields: [
      { key: "temperature", label: { en: "Temperature", nl: "Temperatuur" }, type: "number", unit: "°C" },
      { key: "humidity", label: { en: "Humidity", nl: "Vochtigheid" }, type: "number", unit: "%" },
    ],
    primaryField: "temperature",
    rules: [
      { id: "cold", field: "temperature", operator: "lt", value: 18, tone: "info", label: { en: "Cold", nl: "Koud" }, icon: "snowflake" },
      { id: "comfortable", field: "temperature", operator: "between", value: 18, valueTo: 24, tone: "success", label: { en: "Comfortable", nl: "Aangenaam" } },
      { id: "warm", field: "temperature", operator: "gt", value: 24, tone: "warning", label: { en: "Warm", nl: "Warm" }, icon: "sun" },
    ],
    staleAfterMinutes: 60,
  },
  {
    key: "laundry",
    name: { en: "Washer/dryer", nl: "Wasmachine/droogkast" },
    description: { en: "Running when it draws more than 5 W (smart plug), with the time left if known.", nl: "Bezig zodra hij meer dan 5 W verbruikt (slimme stekker), met de resterende tijd als die gekend is." },
    icon: "washing-machine",
    category: "appliance",
    fields: [
      { key: "power", label: { en: "Power", nl: "Vermogen" }, type: "number", unit: "W" },
      { key: "remainingMinutes", label: { en: "Time left", nl: "Resterende tijd" }, type: "number", unit: "min" },
    ],
    primaryField: "power",
    rules: [
      { id: "running", field: "power", operator: "gt", value: 5, tone: "success", label: { en: "Running", nl: "Bezig" }, icon: "washing-machine", pulse: true },
      { id: "idle", field: "power", operator: "lte", value: 5, tone: "neutral", label: { en: "Idle", nl: "Niet actief" } },
    ],
    staleAfterMinutes: 30,
  },
  {
    key: "alarm_panel",
    name: { en: "Alarm panel", nl: "Alarmcentrale" },
    description: { en: "Disarmed, armed (home or away) or triggered.", nl: "Uitgeschakeld, ingeschakeld (thuis of afwezig) of alarm." },
    icon: "shield",
    category: "alarm",
    fields: [
      {
        key: "state",
        label: { en: "State", nl: "Status" },
        type: "choice",
        choices: Object.entries(ALARM_STATES).map(([value, label]) => ({ value, label })),
      },
    ],
    primaryField: "state",
    rules: [
      { id: "triggered", field: "state", operator: "eq", value: "triggered", tone: "danger", label: ALARM_STATES.triggered, icon: "siren", pulse: true },
      { id: "armed-away", field: "state", operator: "eq", value: "armed_away", tone: "info", label: ALARM_STATES.armed_away, icon: "lock" },
      { id: "armed-home", field: "state", operator: "eq", value: "armed_home", tone: "warning", label: ALARM_STATES.armed_home, icon: "shield" },
      { id: "disarmed", field: "state", operator: "eq", value: "disarmed", tone: "neutral", label: ALARM_STATES.disarmed },
    ],
    staleAfterMinutes: null,
  },
  {
    key: "alarm_component",
    name: { en: "Smoke detector", nl: "Rookmelder" },
    description: {
      en: "Also for other alarm components: enabled or bypassed, battery level, triggered.",
      nl: "Ook voor andere alarmonderdelen: ingeschakeld of overbrugd, batterijniveau, alarm.",
    },
    icon: "smoke",
    category: "alarm",
    fields: [
      {
        key: "triggered",
        label: { en: "Triggered", nl: "Alarm" },
        type: "boolean",
        trueLabel: { en: "Alarm", nl: "Alarm" },
        falseLabel: { en: "OK", nl: "OK" },
      },
      {
        key: "bypassed",
        label: { en: "Bypassed", nl: "Overbrugd" },
        type: "boolean",
        trueLabel: { en: "Bypassed", nl: "Overbrugd" },
        falseLabel: { en: "Enabled", nl: "Ingeschakeld" },
      },
      battery,
    ],
    primaryField: "battery",
    rules: [
      { id: "triggered", field: "triggered", operator: "is_true", tone: "danger", label: { en: "Alarm!", nl: "Alarm!" }, icon: "siren", pulse: true },
      { id: "bypassed", field: "bypassed", operator: "is_true", tone: "warning", label: { en: "Bypassed", nl: "Overbrugd" } },
      { id: "battery-low", field: "battery", operator: "lt", value: 20, tone: "warning", label: { en: "Battery low", nl: "Batterij bijna leeg" }, icon: "battery" },
      { id: "ok", field: "triggered", operator: "is_false", tone: "success", label: { en: "OK", nl: "OK" } },
    ],
    staleAfterMinutes: null,
  },
  {
    key: "light",
    name: { en: "Light", nl: "Lamp" },
    description: { en: "On or off, with the brightness for dimmable lights.", nl: "Aan of uit, met de helderheid voor dimbare lampen." },
    icon: "lightbulb",
    category: "light",
    fields: [
      { key: "on", label: { en: "On", nl: "Aan" }, type: "boolean", trueLabel: { en: "On", nl: "Aan" }, falseLabel: { en: "Off", nl: "Uit" } },
      { key: "brightness", label: { en: "Brightness", nl: "Helderheid" }, type: "number", unit: "%" },
    ],
    primaryField: "on",
    rules: [
      { id: "on", field: "on", operator: "is_true", tone: "warning", label: { en: "On", nl: "Aan" }, icon: "lightbulb" },
      { id: "off", field: "on", operator: "is_false", tone: "neutral", label: { en: "Off", nl: "Uit" } },
    ],
    staleAfterMinutes: null,
  },
  {
    key: "motion",
    name: { en: "Motion sensor", nl: "Bewegingsmelder" },
    description: { en: "Motion detected or clear.", nl: "Beweging gedetecteerd of niet." },
    icon: "motion",
    category: "sensor",
    fields: [
      {
        key: "detected",
        label: { en: "Motion", nl: "Beweging" },
        type: "boolean",
        trueLabel: { en: "Motion", nl: "Beweging" },
        falseLabel: { en: "Clear", nl: "Geen beweging" },
      },
      battery,
    ],
    primaryField: "detected",
    rules: [
      { id: "detected", field: "detected", operator: "is_true", tone: "info", label: { en: "Motion", nl: "Beweging" }, icon: "motion", pulse: true },
      { id: "clear", field: "detected", operator: "is_false", tone: "neutral", label: { en: "Clear", nl: "Geen beweging" } },
    ],
    staleAfterMinutes: null,
  },
];

export const DEVICE_PRESET_KEYS = DEVICE_PRESETS.map((preset) => preset.key);

export function listDevicePresets(locale: Locale): DevicePresetSummary[] {
  return DEVICE_PRESETS.map((preset) => ({
    key: preset.key,
    name: preset.name[locale],
    icon: preset.icon,
    category: preset.category,
    description: preset.description[locale],
  }));
}

/** The profile a preset creates, in one language. Undefined for an unknown key. */
export function devicePresetProfile(key: string, locale: Locale): DeviceProfileData | undefined {
  const preset = DEVICE_PRESETS.find((candidate) => candidate.key === key);
  if (!preset) return undefined;
  return {
    name: preset.name[locale],
    icon: preset.icon,
    category: preset.category,
    fields: preset.fields.map((field) => ({
      key: field.key,
      label: field.label[locale],
      type: field.type,
      unit: field.unit ?? null,
      ...(field.choices && { choices: field.choices.map((choice) => ({ value: choice.value, label: choice.label[locale] })) }),
      trueLabel: field.trueLabel?.[locale] ?? null,
      falseLabel: field.falseLabel?.[locale] ?? null,
    })),
    primaryField: preset.primaryField,
    rules: preset.rules.map((rule) => ({ ...rule, label: rule.label[locale], pulse: rule.pulse ?? false })),
    fallbackTone: "neutral",
    fallbackLabel: preset.fallbackLabel?.[locale] ?? null,
    staleAfterMinutes: preset.staleAfterMinutes,
    presetKey: preset.key,
  };
}
