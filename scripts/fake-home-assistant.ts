/**
 * A fake Home Assistant for development and runtime checks, so the integration can be tried without a real
 * instance. Speaks enough of the WebSocket API (https://developers.home-assistant.io/docs/api/websocket):
 * auth, get_states, subscribe_events (state_changed), ping, call_service (alarm arm/disarm, code 1234),
 * the area/device/entity registries, energy/get_prefs, recorder/get_statistics_metadata,
 * recorder/statistics_during_period (generated hourly kWh) and history/history_during_period.
 *
 *   npx tsx scripts/fake-home-assistant.ts [port]          # default 18123, token "test-token"
 *   HOME_ASSISTANT_URL=http://127.0.0.1:18123 HOME_ASSISTANT_TOKEN=test-token npm run dev
 *
 * A small control API on port + 1 changes states from outside:
 *   curl -X POST localhost:18124/set -d '{"entity_id":"binary_sensor.kitchen_window","state":"on"}'
 *   curl localhost:18124/calls                              # service calls received (codes masked)
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.argv[2] ?? process.env.FAKE_HA_PORT ?? 18123);
const TOKEN = process.env.FAKE_HA_TOKEN ?? "test-token";
const ALARM_CODE = "1234";
const VERSION = "2026.10.0";
const HOUR = 3_600_000;
/** The fake recorder has statistics from this long ago on. */
const RECORDER_START = Date.now() - 45 * 24 * HOUR;

type State = { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string; last_reported: string };

const now = () => new Date().toISOString();
const state = (entity_id: string, value: string, attributes: Record<string, unknown>): State => ({
  entity_id,
  state: value,
  attributes,
  last_changed: now(),
  last_updated: now(),
  last_reported: now(),
});

const states = new Map<string, State>(
  [
    state("binary_sensor.kitchen_window", "off", { device_class: "window", friendly_name: "Kitchen window" }),
    state("binary_sensor.front_door", "off", { device_class: "door", friendly_name: "Front door" }),
    state("sensor.living_temperature", "21.4", { device_class: "temperature", unit_of_measurement: "°C", state_class: "measurement", friendly_name: "Living temperature" }),
    state("sensor.bedroom_temperature", "18.9", { device_class: "temperature", unit_of_measurement: "°C", friendly_name: "Bedroom temperature" }),
    state("sensor.wasmachine_power", "0", { device_class: "power", unit_of_measurement: "W", friendly_name: "Wasmachine power" }),
    state("climate.living", "heat", { current_temperature: 21.2, temperature: 21, friendly_name: "Living thermostat" }),
    state("alarm_control_panel.verisure", "disarmed", { code_format: "number", code_arm_required: false, supported_features: 3, friendly_name: "Verisure" }),
    state("light.hall", "off", { friendly_name: "Hall" }),
  ].map((entry) => [entry.entity_id, entry]),
);
const areaOf: Record<string, string> = {
  "binary_sensor.kitchen_window": "kitchen",
  "binary_sensor.front_door": "hall",
  "sensor.living_temperature": "living",
  "sensor.bedroom_temperature": "bedroom",
  "climate.living": "living",
  "light.hall": "hall",
};
const alarmHistory: { s: string; lu: number }[] = [
  { s: "armed_away", lu: (Date.now() - 30 * HOUR) / 1000 },
  { s: "disarmed", lu: (Date.now() - 20 * HOUR) / 1000 },
];
const calls: { domain: string; service: string; entity: unknown; code: string | null; ok: boolean }[] = [];

const ENERGY_PREFS = {
  energy_sources: [
    {
      type: "grid",
      flow_from: [{ stat_energy_from: "sensor.p1_energy_import_tariff_1" }, { stat_energy_from: "sensor.p1_energy_import_tariff_2" }],
      flow_to: [{ stat_energy_to: "sensor.p1_energy_export_tariff_1" }],
    },
    { type: "solar", stat_energy_from: "sensor.inverter_energy" },
  ],
  device_consumption: [
    { stat_consumption: "sensor.wasmachine_energy", name: "Wasmachine" },
    { stat_consumption: "sensor.kitchen_energy", name: "Kitchen" },
    { stat_consumption: "sensor.kettle_energy", name: "Kettle", included_in_stat: "sensor.kitchen_energy" },
  ],
};

/** Deterministic hourly kWh per statistic. */
function change(statisticId: string, start: number): number {
  const hour = new Date(start).getUTCHours();
  switch (statisticId) {
    case "sensor.p1_energy_import_tariff_1":
      return hour >= 6 && hour < 21 ? 0.35 : 0;
    case "sensor.p1_energy_import_tariff_2":
      return hour >= 6 && hour < 21 ? 0 : 0.25;
    case "sensor.p1_energy_export_tariff_1":
      return hour >= 10 && hour < 16 ? 0.6 : 0;
    case "sensor.inverter_energy":
      return hour >= 8 && hour < 18 ? 1.1 : 0;
    case "sensor.wasmachine_energy":
      return hour === 9 ? 0.9 : 0;
    case "sensor.kitchen_energy":
      return 0.2;
    case "sensor.kettle_energy":
      return hour === 7 ? 0.15 : 0;
    default:
      return 0.01;
  }
}

const clients = new Set<WebSocket>();
const subscriptions = new Map<WebSocket, Set<number>>();

function broadcast(entityId: string, oldState: State | null, newState: State | null) {
  for (const socket of clients) {
    for (const id of subscriptions.get(socket) ?? []) {
      socket.send(JSON.stringify({ id, type: "event", event: { event_type: "state_changed", data: { entity_id: entityId, old_state: oldState, new_state: newState }, time_fired: now() } }));
    }
  }
}

function setState(entityId: string, value: string, attributes?: Record<string, unknown>) {
  const old = states.get(entityId) ?? null;
  const next: State = {
    entity_id: entityId,
    state: value,
    attributes: { ...(old?.attributes ?? {}), ...(attributes ?? {}) },
    last_changed: old && old.state === value ? old.last_changed : now(),
    last_updated: now(),
    last_reported: now(),
  };
  states.set(entityId, next);
  if (entityId.startsWith("alarm_control_panel.")) alarmHistory.push({ s: value, lu: Date.now() / 1000 });
  broadcast(entityId, old, next);
}

type Message = { id: number; type: string; [key: string]: unknown };

function handle(socket: WebSocket, message: Message) {
  const result = (value: unknown) => socket.send(JSON.stringify({ id: message.id, type: "result", success: true, result: value }));
  const error = (code: string, text: string) => socket.send(JSON.stringify({ id: message.id, type: "result", success: false, error: { code, message: text } }));
  switch (message.type) {
    case "ping":
      return socket.send(JSON.stringify({ id: message.id, type: "pong" }));
    case "get_states":
      return result([...states.values()]);
    case "subscribe_events":
      subscriptions.get(socket)?.add(message.id);
      return result(null);
    case "unsubscribe_events":
      subscriptions.get(socket)?.delete(Number(message.subscription));
      return result(null);
    case "config/area_registry/list":
      return result(["kitchen", "hall", "living", "bedroom"].map((id) => ({ area_id: id, name: id[0]!.toUpperCase() + id.slice(1) })));
    case "config/device_registry/list":
      return result([]);
    case "config/entity_registry/list":
      return result([...states.keys()].map((id) => ({ entity_id: id, area_id: areaOf[id] ?? null, device_id: null })));
    case "energy/get_prefs":
      return result(ENERGY_PREFS);
    case "recorder/get_statistics_metadata":
      return result(((message.statistic_ids as string[]) ?? []).map((id) => ({ statistic_id: id, unit_class: "energy", statistics_unit_of_measurement: "kWh" })));
    case "recorder/statistics_during_period": {
      const from = Math.max(RECORDER_START, Math.ceil(new Date(String(message.start_time)).getTime() / HOUR) * HOUR);
      const to = Math.min(Date.now(), new Date(String(message.end_time ?? now())).getTime());
      const out: Record<string, { start: number; end: number; change: number }[]> = {};
      for (const id of (message.statistic_ids as string[]) ?? []) {
        const rows: { start: number; end: number; change: number }[] = [];
        for (let start = from; start + HOUR <= to; start += HOUR) rows.push({ start, end: start + HOUR, change: change(id, start) });
        out[id] = rows;
      }
      return result(out);
    }
    case "history/history_during_period": {
      const ids = (message.entity_ids as string[]) ?? [];
      return result(Object.fromEntries(ids.filter((id) => id.startsWith("alarm_control_panel.")).map((id) => [id, alarmHistory])));
    }
    case "call_service": {
      const target = (message.target as { entity_id?: string } | undefined)?.entity_id ?? (message.service_data as { entity_id?: string } | undefined)?.entity_id;
      const code = (message.service_data as { code?: string } | undefined)?.code ?? null;
      const record = (ok: boolean) => calls.push({ domain: String(message.domain), service: String(message.service), entity: target, code: code ? "•".repeat(code.length) : null, ok });
      if (message.domain !== "alarm_control_panel" || typeof target !== "string" || !states.has(target)) {
        record(false);
        return error("not_found", "Service or entity not found");
      }
      if (message.service === "alarm_disarm") {
        if (code !== ALARM_CODE) {
          record(false);
          return error("home_assistant_error", "Invalid alarm code provided");
        }
        record(true);
        setState(target, "disarmed");
        return result({ context: { id: "fake" } });
      }
      const mode = message.service === "alarm_arm_home" ? "armed_home" : message.service === "alarm_arm_away" ? "armed_away" : null;
      if (!mode) {
        record(false);
        return error("not_found", "Unknown alarm service");
      }
      record(true);
      setState(target, "arming");
      setTimeout(() => setState(target, mode), 300);
      return result({ context: { id: "fake" } });
    }
    default:
      return error("unknown_command", `Unknown command ${message.type}`);
  }
}

const server = createServer();
const wss = new WebSocketServer({ server, path: "/api/websocket" });
wss.on("connection", (socket) => {
  let authed = false;
  socket.send(JSON.stringify({ type: "auth_required", ha_version: VERSION }));
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as Message;
    if (!authed) {
      if (message.type === "auth" && message.access_token === TOKEN) {
        authed = true;
        clients.add(socket);
        subscriptions.set(socket, new Set());
        socket.send(JSON.stringify({ type: "auth_ok", ha_version: VERSION }));
      } else {
        socket.send(JSON.stringify({ type: "auth_invalid", message: "Invalid access token or password" }));
        socket.close();
      }
      return;
    }
    handle(socket, message);
  });
  socket.on("close", () => {
    clients.delete(socket);
    subscriptions.delete(socket);
  });
});
server.listen(PORT, "127.0.0.1", () => console.log(`fake Home Assistant on ws://127.0.0.1:${PORT}/api/websocket (token ${TOKEN === "test-token" ? "test-token" : "from FAKE_HA_TOKEN"})`));

// Control API -----------------------------------------------------------------------------------------------
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/calls") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(calls));
    return;
  }
  if (req.method === "POST" && req.url === "/set") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const { entity_id, state: value, attributes } = JSON.parse(body) as { entity_id: string; state: string; attributes?: Record<string, unknown> };
      setState(entity_id, value, attributes);
      res.end("ok\n");
    });
    return;
  }
  if (req.method === "POST" && req.url === "/drop") {
    for (const socket of clients) socket.terminate();
    res.end("dropped\n");
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(PORT + 1, "127.0.0.1");
