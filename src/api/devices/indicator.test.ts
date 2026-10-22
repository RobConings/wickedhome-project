/**
 * Unit tests for the device rule engine, value coercion and presets. No database needed. Run on the server:
 *
 *   npx tsx --test src/api/devices/indicator.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEVICE_PRESETS, devicePresetProfile, listDevicePresets } from "@/features/devices/types/device-presets";
import {
  coerceFieldValue,
  deviceProfileInputSchema,
  formatFieldValue,
  isValueStale,
  type DeviceField,
  type DeviceProfileData,
  type IndicatorRule,
} from "@/features/devices/types/devices";
import { evaluateIndicator, indicatorLegend, ruleMatches } from "@/features/devices/types/indicator";

const preset = (key: string, locale: "en" | "nl" = "en"): DeviceProfileData => {
  const profile = devicePresetProfile(key, locale);
  assert.ok(profile, `preset ${key} exists`);
  return profile;
};

const NOW = Date.parse("2026-10-02T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const numberField: DeviceField = { key: "t", label: "T", type: "number", unit: "°C" };
const rule = (partial: Partial<IndicatorRule>): IndicatorRule => ({
  id: "r",
  field: "t",
  operator: "eq",
  tone: "success",
  label: "x",
  pulse: false,
  ...partial,
});

describe("evaluateIndicator: window contact", () => {
  const contact = preset("contact");

  it("shows danger 'Open' when the window is open", () => {
    const result = evaluateIndicator(contact, { isOpen: true });
    assert.equal(result.tone, "danger");
    assert.equal(result.label, "Open");
    assert.equal(result.ruleId, "open");
    assert.equal(result.icon, "window");
    assert.equal(result.unknown, false);
  });

  it("shows success 'Closed' when it is closed", () => {
    const result = evaluateIndicator(contact, { isOpen: { value: false, updatedAt: minutesAgo(5000), source: "home_assistant" } }, { now: NOW });
    assert.equal(result.tone, "success");
    assert.equal(result.label, "Closed");
    // Contacts never go stale (they only report changes).
    assert.equal(result.stale, false);
  });

  it("falls back when the value is unknown", () => {
    const result = evaluateIndicator(contact, {});
    assert.equal(result.tone, "neutral");
    assert.equal(result.ruleId, null);
    assert.equal(result.label, null);
    assert.equal(result.unknown, true);
  });

  it("accepts Home Assistant style strings", () => {
    assert.equal(evaluateIndicator(contact, { isOpen: "on" }).label, "Open");
    assert.equal(evaluateIndicator(contact, { isOpen: "off" }).label, "Closed");
    assert.equal(evaluateIndicator(contact, { isOpen: "unavailable" }).ruleId, null);
  });

  it("uses Dutch labels from the Dutch preset", () => {
    assert.equal(evaluateIndicator(preset("contact", "nl"), { isOpen: false }).label, "Dicht");
  });
});

describe("evaluateIndicator: temperature bands", () => {
  const climate = preset("climate");
  const cases: [number, string, string][] = [
    [12, "info", "Cold"],
    [17.9, "info", "Cold"],
    [18, "success", "Comfortable"],
    [21.5, "success", "Comfortable"],
    [24, "success", "Comfortable"],
    [24.1, "warning", "Warm"],
    [38, "warning", "Warm"],
  ];
  for (const [temperature, tone, label] of cases) {
    it(`${temperature} °C is ${label}`, () => {
      const result = evaluateIndicator(climate, { temperature });
      assert.equal(result.tone, tone);
      assert.equal(result.label, label);
      assert.equal(result.primary?.value, temperature);
      assert.equal(result.primary?.field.key, "temperature");
    });
  }

  it("parses numeric strings with a comma or a dot", () => {
    assert.equal(evaluateIndicator(climate, { temperature: "21,5" }).label, "Comfortable");
    assert.equal(evaluateIndicator(climate, { temperature: "25.2" }).label, "Warm");
  });

  it("treats a stale Home Assistant value as unknown", () => {
    const result = evaluateIndicator(climate, { temperature: { value: 21, updatedAt: minutesAgo(61), source: "home_assistant" } }, { now: NOW });
    assert.equal(result.stale, true);
    assert.equal(result.ruleId, null);
    assert.equal(result.tone, "neutral");
    assert.equal(result.primary?.value, null);
  });

  it("keeps a fresh Home Assistant value", () => {
    const result = evaluateIndicator(climate, { temperature: { value: 21, updatedAt: minutesAgo(10), source: "home_assistant" } }, { now: NOW });
    assert.equal(result.stale, false);
    assert.equal(result.label, "Comfortable");
  });

  it("never marks manual values stale", () => {
    const result = evaluateIndicator(climate, { temperature: { value: 21, updatedAt: minutesAgo(10_000), source: "manual" } }, { now: NOW });
    assert.equal(result.stale, false);
    assert.equal(result.label, "Comfortable");
  });

  it("ignores non-numeric garbage", () => {
    assert.equal(evaluateIndicator(climate, { temperature: "warm-ish" }).ruleId, null);
  });
});

describe("evaluateIndicator: washer/dryer, alarm, smoke detector", () => {
  it("pulses while the dryer runs", () => {
    const result = evaluateIndicator(preset("laundry"), { power: 1250, remainingMinutes: 42 });
    assert.equal(result.tone, "success");
    assert.equal(result.pulse, true);
    assert.equal(result.label, "Running");
  });

  it("is idle at standby power", () => {
    const result = evaluateIndicator(preset("laundry"), { power: 1.2 });
    assert.equal(result.tone, "neutral");
    assert.equal(result.pulse, false);
  });

  it("maps every alarm panel state", () => {
    const panel = preset("alarm_panel");
    assert.equal(evaluateIndicator(panel, { state: "disarmed" }).tone, "neutral");
    assert.equal(evaluateIndicator(panel, { state: "armed_home" }).tone, "warning");
    assert.equal(evaluateIndicator(panel, { state: "armed_away" }).tone, "info");
    const triggered = evaluateIndicator(panel, { state: "triggered" });
    assert.equal(triggered.tone, "danger");
    assert.equal(triggered.pulse, true);
    // A value that is not one of the choices is unknown.
    assert.equal(evaluateIndicator(panel, { state: "pending" }).ruleId, null);
  });

  it("checks the smoke detector rules in order", () => {
    const smoke = preset("alarm_component");
    assert.equal(evaluateIndicator(smoke, { triggered: true, bypassed: true, battery: 5 }).ruleId, "triggered");
    assert.equal(evaluateIndicator(smoke, { triggered: false, bypassed: true, battery: 90 }).ruleId, "bypassed");
    assert.equal(evaluateIndicator(smoke, { triggered: false, bypassed: false, battery: 12 }).ruleId, "battery-low");
    assert.equal(evaluateIndicator(smoke, { triggered: false, bypassed: false, battery: 80 }).ruleId, "ok");
    // Battery unknown: the rule on it is skipped, the next one still matches.
    assert.equal(evaluateIndicator(smoke, { triggered: false, bypassed: false }).ruleId, "ok");
  });
});

describe("ruleMatches operators", () => {
  it("compares numbers", () => {
    assert.equal(ruleMatches(rule({ operator: "gt", value: 5 }), numberField, 6), true);
    assert.equal(ruleMatches(rule({ operator: "gt", value: 5 }), numberField, 5), false);
    assert.equal(ruleMatches(rule({ operator: "gte", value: 5 }), numberField, 5), true);
    assert.equal(ruleMatches(rule({ operator: "lt", value: 5 }), numberField, 4.99), true);
    assert.equal(ruleMatches(rule({ operator: "lte", value: 5 }), numberField, 5), true);
    assert.equal(ruleMatches(rule({ operator: "eq", value: 5 }), numberField, 5), true);
    assert.equal(ruleMatches(rule({ operator: "eq", value: "5" }), numberField, 5), true);
    assert.equal(ruleMatches(rule({ operator: "neq", value: 5 }), numberField, 6), true);
  });

  it("handles between inclusively and with swapped bounds", () => {
    assert.equal(ruleMatches(rule({ operator: "between", value: 10, valueTo: 20 }), numberField, 10), true);
    assert.equal(ruleMatches(rule({ operator: "between", value: 10, valueTo: 20 }), numberField, 20), true);
    assert.equal(ruleMatches(rule({ operator: "between", value: 20, valueTo: 10 }), numberField, 15), true);
    assert.equal(ruleMatches(rule({ operator: "between", value: 10, valueTo: 20 }), numberField, 20.1), false);
    assert.equal(ruleMatches(rule({ operator: "between", value: 10 }), numberField, 15), false);
  });

  it("matches text and choices with eq, neq and in", () => {
    const text: DeviceField = { key: "t", label: "T", type: "text" };
    assert.equal(ruleMatches(rule({ operator: "eq", value: "eco" }), text, "eco"), true);
    assert.equal(ruleMatches(rule({ operator: "neq", value: "eco" }), text, "boost"), true);
    assert.equal(ruleMatches(rule({ operator: "in", values: ["eco", "away"] }), text, "away"), true);
    assert.equal(ruleMatches(rule({ operator: "in", values: ["eco", "away"] }), text, "boost"), false);
    assert.equal(ruleMatches(rule({ operator: "in" }), text, "boost"), false);
  });

  it("never matches an unknown value, not even neq", () => {
    assert.equal(ruleMatches(rule({ operator: "neq", value: 5 }), numberField, null), false);
  });

  it("handles booleans", () => {
    const flag: DeviceField = { key: "t", label: "T", type: "boolean" };
    assert.equal(ruleMatches(rule({ operator: "is_true" }), flag, true), true);
    assert.equal(ruleMatches(rule({ operator: "is_false" }), flag, true), false);
    assert.equal(ruleMatches(rule({ operator: "eq", value: true }), flag, true), true);
  });
});

describe("first match wins and fallback", () => {
  it("uses the first matching rule even when later rules match too", () => {
    const profile = {
      fields: [numberField],
      primaryField: "t",
      rules: [rule({ id: "a", operator: "gt", value: 10, label: "A" }), rule({ id: "b", operator: "gt", value: 0, label: "B" })],
      fallbackTone: "neutral" as const,
      fallbackLabel: "Nothing",
      staleAfterMinutes: null,
    };
    assert.equal(evaluateIndicator(profile, { t: 20 }).ruleId, "a");
    assert.equal(evaluateIndicator(profile, { t: 5 }).ruleId, "b");
    const fallback = evaluateIndicator(profile, { t: -5 });
    assert.equal(fallback.ruleId, null);
    assert.equal(fallback.label, "Nothing");
    assert.equal(fallback.unknown, false);
  });

  it("ignores rules on fields the profile does not have", () => {
    const profile = {
      fields: [numberField],
      primaryField: null,
      rules: [rule({ id: "ghost", field: "missing", operator: "is_true" })],
      fallbackTone: "info" as const,
      staleAfterMinutes: null,
    };
    assert.equal(evaluateIndicator(profile, { missing: true }).tone, "info");
  });

  it("returns a custom colour", () => {
    const profile = {
      fields: [numberField],
      primaryField: null,
      rules: [rule({ operator: "gt", value: 0, color: "#ff00aa" })],
      fallbackTone: "neutral" as const,
      staleAfterMinutes: null,
    };
    assert.equal(evaluateIndicator(profile, { t: 1 }).color, "#ff00aa");
  });
});

describe("helpers", () => {
  it("coerces values per field type", () => {
    assert.equal(coerceFieldValue({ type: "boolean" }, "ON"), true);
    assert.equal(coerceFieldValue({ type: "boolean" }, "maybe"), undefined);
    assert.equal(coerceFieldValue({ type: "number" }, "12,5"), 12.5);
    assert.equal(coerceFieldValue({ type: "number" }, "abc"), undefined);
    assert.equal(coerceFieldValue({ type: "choice", choices: [{ value: "a", label: "A" }] }, "a"), "a");
    assert.equal(coerceFieldValue({ type: "choice", choices: [{ value: "a", label: "A" }] }, "b"), undefined);
    assert.equal(coerceFieldValue({ type: "text" }, 12), "12");
    assert.equal(coerceFieldValue({ type: "number" }, null), null);
  });

  it("decides staleness only for Home Assistant values", () => {
    assert.equal(isValueStale({ source: "manual", updatedAt: null }, 60, NOW), false);
    assert.equal(isValueStale({ source: "home_assistant", updatedAt: null }, 60, NOW), true);
    assert.equal(isValueStale({ source: "home_assistant", updatedAt: minutesAgo(59) }, 60, NOW), false);
    assert.equal(isValueStale({ source: "home_assistant", updatedAt: minutesAgo(61) }, 60, NOW), true);
    assert.equal(isValueStale({ source: "home_assistant", updatedAt: minutesAgo(9999) }, null, NOW), false);
  });

  it("formats values in Belgian style", () => {
    assert.equal(formatFieldValue(numberField, 21.5, "nl"), "21,5 °C");
    // Both languages use Belgian number formatting (comma decimals).
    assert.equal(formatFieldValue(numberField, 21.5, "en"), "21,5 °C");
    assert.equal(formatFieldValue({ type: "number", unit: "%" }, 85, "en"), "85%");
    assert.equal(formatFieldValue({ type: "boolean", trueLabel: "Open", falseLabel: "Dicht" }, false, "nl"), "Dicht");
    assert.equal(formatFieldValue({ type: "boolean" }, true, "nl"), "Ja");
    assert.equal(formatFieldValue({ type: "choice", choices: [{ value: "armed_home", label: "Armed (home)" }] }, "armed_home", "en"), "Armed (home)");
    assert.equal(formatFieldValue(numberField, null, "en"), null);
  });

  it("builds a legend without duplicates", () => {
    const legend = indicatorLegend(preset("climate"));
    assert.deepEqual(
      legend.map((entry) => entry.label),
      ["Cold", "Comfortable", "Warm", null],
    );
  });
});

describe("presets", () => {
  for (const { key } of DEVICE_PRESETS) {
    for (const locale of ["en", "nl"] as const) {
      it(`${key} (${locale}) is a valid profile`, () => {
        const result = deviceProfileInputSchema.safeParse(devicePresetProfile(key, locale));
        assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
      });
    }
  }

  it("lists presets in both languages", () => {
    assert.equal(listDevicePresets("nl").find((entry) => entry.key === "contact")?.name, "Raam-/deurcontact");
    assert.equal(devicePresetProfile("nope", "en"), undefined);
  });

  it("rejects invalid profiles", () => {
    const base = preset("climate");
    const badOperator = { ...base, rules: [{ ...base.rules[0]!, operator: "is_true" }] };
    assert.equal(deviceProfileInputSchema.safeParse(badOperator).success, false);
    const badPrimary = { ...base, primaryField: "nope" };
    assert.equal(deviceProfileInputSchema.safeParse(badPrimary).success, false);
    const duplicateKeys = { ...base, fields: [base.fields[0]!, base.fields[0]!] };
    assert.equal(deviceProfileInputSchema.safeParse(duplicateKeys).success, false);
    const emptyChoice = { ...base, fields: [{ key: "mode", label: "Mode", type: "choice", choices: [] }], rules: [], primaryField: null };
    assert.equal(deviceProfileInputSchema.safeParse(emptyChoice).success, false);
  });
});
