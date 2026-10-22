/**
 * Unit tests for the Home Assistant integration: state mapping, energy preferences (both grid shapes),
 * statistics → intervals, the WebSocket client's reconnect/backoff, and the alarm disarm guard. No database
 * and no Home Assistant needed. Run on the server:
 *
 *   npx tsx --test src/api/home-assistant/home-assistant.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALARM_ACTION_POLICY } from "@/features/home-assistant/types/home-assistant";
import { entityFitsField, entityValueKind } from "@/features/home-assistant/types/ha-entity-kind";
import { alarmRefusal, scrubCode, type AlarmActor } from "./alarm-guard";
import { parseAlarmHistory } from "./ha-alarm";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, nextBackoffMs } from "./ha-backoff";
import { HomeAssistantClient, isDisarmCall, websocketUrl, type HaSocketFactory, type HaSocketHandlers } from "./ha-client";
import { backfillStart, currentHourStart, parseEnergyPrefs, registerOf, statisticsToIntervals, subtractIncluded } from "./ha-energy-prefs";
import { buildSuggestions, haStateToFieldValue, suggestPreset, toHaEntity } from "./ha-state-mapping";

const state = (value: string, attributes: Record<string, unknown> = {}) => ({ entity_id: "sensor.x", state: value, attributes });

describe("state mapping", () => {
  const bool = { type: "boolean" as const };
  const num = { type: "number" as const };
  const alarm = { type: "choice" as const, choices: ["disarmed", "armed_home", "armed_away", "triggered"].map((value) => ({ value, label: value })) };

  it("maps on/off, open/closed to booleans", () => {
    assert.deepEqual(haStateToFieldValue(bool, state("on")), { value: true, available: true });
    assert.deepEqual(haStateToFieldValue(bool, state("off")), { value: false, available: true });
    assert.equal(haStateToFieldValue(bool, state("open")).value, true);
    assert.equal(haStateToFieldValue(bool, state("closed")).value, false);
  });

  it("maps numeric states and attributes to numbers", () => {
    assert.equal(haStateToFieldValue(num, state("21.5", { unit_of_measurement: "°C" })).value, 21.5);
    assert.equal(haStateToFieldValue(num, state("heat", { current_temperature: 19 }), "current_temperature").value, 19);
    assert.equal(haStateToFieldValue(num, state("not a number")).value, null);
  });

  it("marks unavailable and unknown states as unknown (not available)", () => {
    assert.deepEqual(haStateToFieldValue(num, state("unavailable")), { value: null, available: false });
    assert.deepEqual(haStateToFieldValue(bool, state("unknown")), { value: null, available: false });
    assert.deepEqual(haStateToFieldValue(bool, null), { value: null, available: false });
  });

  it("maps alarm states onto the preset's choices, with aliases", () => {
    assert.equal(haStateToFieldValue(alarm, state("armed_away")).value, "armed_away");
    assert.equal(haStateToFieldValue(alarm, state("armed_night")).value, "armed_home");
    assert.equal(haStateToFieldValue(alarm, state("armed_vacation")).value, "armed_away");
    assert.equal(haStateToFieldValue(alarm, state("arming")).value, null);
  });

  it("keeps text states for text fields", () => {
    assert.equal(haStateToFieldValue({ type: "text" }, state("running")).value, "running");
  });

  it("tells which entities fit a field type", () => {
    assert.equal(entityValueKind({ domain: "binary_sensor", state: "off", unit: null }), "boolean");
    assert.equal(entityValueKind({ domain: "sensor", state: "21.4", unit: "°C" }), "number");
    assert.equal(entityValueKind({ domain: "sensor", state: "running", unit: null }), "text");
    assert.equal(entityFitsField({ domain: "sensor", state: "21.4", unit: "°C" }, "boolean"), false);
    assert.equal(entityFitsField({ domain: "alarm_control_panel", state: "disarmed", unit: null }, "choice"), true);
  });
});

describe("device import suggestions", () => {
  const entity = (entity_id: string, value: string, attributes: Record<string, unknown>) => toHaEntity({ entity_id, state: value, attributes }, "Kitchen");

  it("suggests presets for contacts, temperature, alarm and laundry power", () => {
    assert.deepEqual(suggestPreset(entity("binary_sensor.kitchen_window", "off", { device_class: "window" })), { presetKey: "contact", fieldKey: "isOpen" });
    assert.deepEqual(suggestPreset(entity("sensor.living_temperature", "21", { device_class: "temperature", unit_of_measurement: "°C" })), {
      presetKey: "climate",
      fieldKey: "temperature",
    });
    assert.deepEqual(suggestPreset(entity("alarm_control_panel.verisure", "disarmed", {})), { presetKey: "alarm_panel", fieldKey: "state" });
    assert.deepEqual(suggestPreset(entity("sensor.wasmachine_power", "1200", { device_class: "power", unit_of_measurement: "W" })), {
      presetKey: "laundry",
      fieldKey: "power",
    });
    assert.equal(suggestPreset(entity("sensor.fridge_power", "80", { device_class: "power", unit_of_measurement: "W" })), null);
    assert.equal(suggestPreset(entity("light.hall", "on", {})), null);
  });

  it("flags entities that are already bound", () => {
    const list = buildSuggestions([entity("binary_sensor.door", "on", { device_class: "door", friendly_name: "Front door" })], new Set(["binary_sensor.door"]));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.alreadyBound, true);
    assert.equal(list[0]?.name, "Front door");
  });
});

describe("energy preferences", () => {
  it("parses the legacy flow_from/flow_to grid shape, solar, battery, gas and devices", () => {
    const parsed = parseEnergyPrefs({
      energy_sources: [
        {
          type: "grid",
          flow_from: [{ stat_energy_from: "sensor.p1_energy_import_tariff_1" }, { stat_energy_from: "sensor.p1_energy_import_tariff_2" }],
          flow_to: [{ stat_energy_to: "sensor.p1_energy_export_tariff_1" }],
        },
        { type: "solar", stat_energy_from: "sensor.inverter_energy" },
        { type: "battery", stat_energy_from: "sensor.battery_out", stat_energy_to: "sensor.battery_in" },
        { type: "gas", stat_energy_from: "sensor.gas_meter" },
        { type: "water", stat_energy_from: "sensor.water" },
      ],
      device_consumption: [
        { stat_consumption: "sensor.washer_energy", name: "Washer" },
        { stat_consumption: "sensor.kitchen_plug_energy", included_in_stat: "sensor.kitchen_energy" },
      ],
    });
    assert.deepEqual(
      parsed.sources.map((source) => [source.statisticId, source.kind, source.carrier, source.register]),
      [
        ["sensor.p1_energy_import_tariff_1", "grid_import", "electricity", "day"],
        ["sensor.p1_energy_import_tariff_2", "grid_import", "electricity", "night"],
        ["sensor.p1_energy_export_tariff_1", "grid_export", "electricity", "day"],
        ["sensor.inverter_energy", "solar_production", "electricity", "single"],
        ["sensor.battery_out", "battery_discharge", "electricity", "single"],
        ["sensor.battery_in", "battery_charge", "electricity", "single"],
        ["sensor.gas_meter", "grid_import", "gas", "single"],
      ],
    );
    assert.deepEqual(parsed.devices, [
      { statisticId: "sensor.washer_energy", name: "Washer", includedIn: null },
      { statisticId: "sensor.kitchen_plug_energy", name: null, includedIn: "sensor.kitchen_energy" },
    ]);
  });

  it("parses the flat grid shape (one stat_energy_from / stat_energy_to per grid entry)", () => {
    const parsed = parseEnergyPrefs({
      energy_sources: [
        { type: "grid", stat_energy_from: "sensor.electricity_meter_energy_consumption_tarif_1", stat_energy_to: "sensor.electricity_meter_energy_production_tarif_1" },
        { type: "grid", stat_energy_from: "sensor.electricity_meter_energy_consumption_tarif_2", stat_energy_to: null },
      ],
    });
    assert.deepEqual(
      parsed.sources.map((source) => [source.kind, source.register]),
      [
        ["grid_import", "day"],
        ["grid_export", "day"],
        ["grid_import", "night"],
      ],
    );
  });

  it("ignores junk and duplicates", () => {
    assert.deepEqual(parseEnergyPrefs(null), { sources: [], devices: [] });
    const parsed = parseEnergyPrefs({ energy_sources: [{ type: "solar", stat_energy_from: "sensor.a" }, { type: "solar", stat_energy_from: "sensor.a" }, "x"] });
    assert.equal(parsed.sources.length, 1);
  });

  it("detects Belgian tariff registers", () => {
    assert.equal(registerOf("sensor.p1_meter_energy_import_t1"), "day");
    assert.equal(registerOf("sensor.dsmr_reading_electricity_delivered_2"), "single");
    assert.equal(registerOf("sensor.energy_import_tarief_2"), "night");
    assert.equal(registerOf("sensor.t1000_energy"), "single");
  });
});

describe("statistics → intervals", () => {
  const hour = (iso: string) => new Date(iso).getTime();

  it("converts kWh changes (epoch ms and ISO) to Wh and skips gaps and negatives", () => {
    const intervals = statisticsToIntervals([
      { start: hour("2026-10-01T10:00:00Z"), end: hour("2026-10-01T11:00:00Z"), change: 0.4567 },
      { start: "2026-10-01T11:00:00+00:00", change: 1.2 },
      { start: hour("2026-10-01T12:00:00Z"), change: null },
      { start: hour("2026-10-01T13:00:00Z"), change: -0.2 },
    ]);
    assert.equal(intervals.length, 2);
    assert.equal(intervals[0]?.energyWh, 457);
    assert.equal(intervals[1]?.energyWh, 1200);
    assert.equal(intervals[1]?.endAt.toISOString(), "2026-10-01T12:00:00.000Z");
  });

  it("keeps gas volume and converts with the calorific value", () => {
    const [gas] = statisticsToIntervals([{ start: hour("2026-10-01T06:00:00Z"), change: 0.5 }], { unitClass: "volume", calorificWhPerM3: 11400 });
    assert.deepEqual([gas?.volumeLitres, gas?.energyWh, gas?.calorificWhPerM3], [500, 5700, 11400]);
  });

  it("subtracts linked child devices from their parent per hour, never below zero", () => {
    const at = (iso: string, wh: number) => ({ startAt: new Date(iso), endAt: new Date(new Date(iso).getTime() + 3_600_000), energyWh: wh, volumeLitres: null, calorificWhPerM3: null });
    const parent = [at("2026-10-01T10:00:00Z", 1000), at("2026-10-01T11:00:00Z", 300)];
    const child = [at("2026-10-01T10:00:00Z", 400), at("2026-10-01T11:00:00Z", 500)];
    assert.deepEqual(subtractIncluded(parent, [child]).map((interval) => interval.energyWh), [600, 0]);
  });

  it("backfills from local midnight on the first of the month", () => {
    assert.equal(backfillStart(new Date("2026-10-03T12:00:00Z"), 30).toISOString(), "2026-08-31T22:00:00.000Z");
    assert.equal(backfillStart(new Date("2026-12-20T12:00:00Z"), 10).toISOString(), "2026-11-30T23:00:00.000Z");
    assert.equal(currentHourStart(new Date("2026-10-03T12:34:56Z")).toISOString(), "2026-10-03T12:00:00.000Z");
  });
});

describe("alarm", () => {
  const user = (role: "owner" | "adult" | "child"): AlarmActor => ({ kind: "user", userId: "u1", name: "Rob", role });
  const assistant: AlarmActor = { kind: "assistant", userId: "u1", name: "Rob", role: "owner" };

  it("never lets the assistant, MCP or voice disarm", () => {
    assert.equal(ALARM_ACTION_POLICY.disarm.assistantAllowed, false);
    assert.equal(alarmRefusal("disarm", assistant), "not_in_ui");
    assert.equal(alarmRefusal("disarm", { ...assistant, kind: "mcp" }), "not_in_ui");
    assert.equal(alarmRefusal("disarm", { ...assistant, kind: "voice" }), "not_in_ui");
  });

  it("lets only owners and adults use the alarm in the UI", () => {
    assert.equal(alarmRefusal("disarm", user("owner")), null);
    assert.equal(alarmRefusal("disarm", user("adult")), null);
    assert.equal(alarmRefusal("disarm", user("child")), "role");
    assert.equal(alarmRefusal("arm_away", user("child")), "role");
    assert.equal(alarmRefusal("arm_home", assistant), null);
  });

  it("scrubs the code from error texts", () => {
    assert.equal(scrubCode("Invalid code 1234 for panel", "1234"), "Invalid code ••• for panel");
  });

  it("refuses disarm through the generic command path", async () => {
    assert.equal(isDisarmCall({ type: "call_service", domain: "alarm_control_panel", service: "alarm_disarm" }), true);
    assert.equal(isDisarmCall({ type: "execute_script", sequence: [{ service: "alarm_control_panel.alarm_disarm" }] }), true);
    assert.equal(isDisarmCall({ type: "call_service", domain: "alarm_control_panel", service: "alarm_arm_away" }), false);
    const client = new HomeAssistantClient({ url: "http://ha.local:8123", token: "t" });
    await assert.rejects(client.sendCommand({ type: "call_service", domain: "alarm_control_panel", service: "alarm_disarm" }), /disarmAlarmPanel/);
  });

  it("parses compressed history into changes, newest first", () => {
    const history = parseAlarmHistory(
      { "alarm_control_panel.home": [{ s: "disarmed", lu: 1_790_000_000 }, { s: "armed_away", lu: 1_790_003_600 }, { s: "armed_away", lu: 1_790_003_700 }, { s: "disarmed", lu: 1_790_007_200 }] },
      "alarm_control_panel.home",
    );
    assert.deepEqual(
      history.map((entry) => entry.state),
      ["disarmed", "armed_away", "disarmed"],
    );
    assert.equal(history[0]?.at, new Date(1_790_007_200_000).toISOString());
  });
});

// The assistant's alarm tools (status, arm home/away, never disarm) are tested in ai/skills/alarm/tools.test.ts.

describe("backoff", () => {
  it("grows exponentially from 1 s and caps at 5 minutes", () => {
    const noJitter = () => 0.5;
    assert.equal(nextBackoffMs(0, { random: noJitter }), BACKOFF_BASE_MS);
    assert.equal(nextBackoffMs(3, { random: noJitter }), 8 * BACKOFF_BASE_MS);
    assert.equal(nextBackoffMs(30, { random: noJitter }), BACKOFF_MAX_MS);
    assert.equal(nextBackoffMs(0, { authFailed: true, random: noJitter }), BACKOFF_MAX_MS);
  });

  it("adds at most ±20 % jitter", () => {
    assert.equal(nextBackoffMs(3, { random: () => 0 }), 6400);
    assert.equal(nextBackoffMs(3, { random: () => 1 }), 9600);
  });
});

describe("WebSocket client", () => {
  type FakeSocket = { handlers: HaSocketHandlers; sent: Record<string, unknown>[]; closed: boolean };
  const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

  function fakeHomeAssistant() {
    const sockets: FakeSocket[] = [];
    const factory: HaSocketFactory = (_url, handlers) => {
      const socket: FakeSocket = { handlers, sent: [], closed: false };
      sockets.push(socket);
      setTimeout(() => {
        handlers.open();
        handlers.message(JSON.stringify({ type: "auth_required", ha_version: "2026.10.0" }));
      }, 1);
      return { send: (text) => socket.sent.push(JSON.parse(text) as Record<string, unknown>), close: () => (socket.closed = true) };
    };
    const reply = (socket: FakeSocket, message: unknown) => socket.handlers.message(JSON.stringify(message));
    return { sockets, factory, reply };
  }

  it("builds the websocket URL from the base URL", () => {
    assert.equal(websocketUrl("http://192.168.1.10:8123"), "ws://192.168.1.10:8123/api/websocket");
    assert.equal(websocketUrl("https://ha.example.be/"), "wss://ha.example.be/api/websocket");
  });

  it("authenticates, subscribes, answers commands and resubscribes after a reconnect", async () => {
    const ha = fakeHomeAssistant();
    const delays: number[] = [];
    const client = new HomeAssistantClient({
      url: "http://ha.local:8123",
      token: "secret-token",
      socketFactory: ha.factory,
      backoff: (attempt) => {
        delays.push(attempt);
        return 5;
      },
      log: () => undefined,
    });
    const events: string[] = [];
    client.subscribeEvents("state_changed", (event) => events.push(String(event.data.entity_id)));
    client.start();
    await wait();
    const first = ha.sockets[0]!;
    assert.deepEqual(first.sent[0], { type: "auth", access_token: "secret-token" });
    ha.reply(first, { type: "auth_ok", ha_version: "2026.10.0" });
    await wait();
    assert.equal(client.getStatus().state, "connected");
    assert.equal(client.getStatus().haVersion, "2026.10.0");
    const subscribe = first.sent.find((message) => message.type === "subscribe_events")!;
    assert.equal(subscribe.event_type, "state_changed");
    ha.reply(first, { id: subscribe.id, type: "result", success: true, result: null });
    ha.reply(first, { id: subscribe.id, type: "event", event: { event_type: "state_changed", data: { entity_id: "sensor.a" } } });
    assert.deepEqual(events, ["sensor.a"]);

    const states = client.sendCommand<unknown[]>({ type: "get_states" });
    await wait(1);
    const request = first.sent.at(-1)!;
    ha.reply(first, { id: request.id, type: "result", success: true, result: [{ entity_id: "sensor.a" }] });
    assert.deepEqual(await states, [{ entity_id: "sensor.a" }]);

    const failing = client.sendCommand({ type: "call_service", domain: "light", service: "turn_on" });
    await wait(1);
    ha.reply(first, { id: first.sent.at(-1)!.id, type: "result", success: false, error: { code: "not_found", message: "Service not found" } });
    await assert.rejects(failing, /Service not found/);

    // The connection drops: error state, backoff, a new socket, and the subscription again.
    first.handlers.close(1006, "");
    assert.equal(client.getStatus().state, "error");
    assert.equal(client.getStatus().errorCode, "unreachable");
    await assert.rejects(client.sendCommand({ type: "get_states" }), /not connected/);
    await wait(30);
    const second = ha.sockets[1]!;
    assert.ok(second, "reconnected");
    ha.reply(second, { type: "auth_ok", ha_version: "2026.10.1" });
    await wait();
    assert.equal(client.getStatus().state, "connected");
    assert.equal(client.getStatus().attempt, 0);
    assert.ok(second.sent.some((message) => message.type === "subscribe_events"));
    assert.deepEqual(delays, [0]);
    client.stop();
    assert.equal(second.closed, true);
  });

  it("waits the maximum after a rejected token", async () => {
    const ha = fakeHomeAssistant();
    const calls: boolean[] = [];
    const client = new HomeAssistantClient({
      url: "http://ha.local:8123",
      token: "wrong",
      socketFactory: ha.factory,
      backoff: (_attempt, authFailed) => {
        calls.push(authFailed);
        return 60_000;
      },
      log: () => undefined,
    });
    client.start();
    await wait();
    ha.reply(ha.sockets[0]!, { type: "auth_invalid", message: "Invalid access token" });
    assert.equal(client.getStatus().state, "error");
    assert.equal(client.getStatus().errorCode, "auth_invalid");
    assert.deepEqual(calls, [true]);
    assert.ok(client.getStatus().nextRetryAt);
    client.stop();
  });

  it("reconnects when a ping gets no pong", async () => {
    const ha = fakeHomeAssistant();
    const client = new HomeAssistantClient({
      url: "http://ha.local:8123",
      token: "t",
      socketFactory: ha.factory,
      pingIntervalMs: 10,
      pongTimeoutMs: 10,
      backoff: () => 1_000,
      log: () => undefined,
    });
    client.start();
    await wait();
    ha.reply(ha.sockets[0]!, { type: "auth_ok", ha_version: "x" });
    await wait(60);
    assert.ok(ha.sockets[0]!.sent.some((message) => message.type === "ping"));
    assert.equal(client.getStatus().state, "error");
    assert.equal(client.getStatus().errorCode, "timeout");
    client.stop();
  });
});
