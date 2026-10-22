# Devices

Things with a state and a place (window/door contacts, thermostats, the dryer, smoke detectors, the alarm panel,
lights), shown as coloured indicators on the floor plan. Values are set by hand, or follow a Home Assistant
entity live through the same code path (see "Home Assistant (as built)").

## Model

| Concept | Where | What |
|---|---|---|
| **Profile** | `DeviceProfile` (household-level) | A device *type*: name, icon key, category, **fields**, ordered **indicator rules**, a fallback tone/label, and `staleAfterMinutes` |
| **Device** | `Device` | Name, profile, optional place, optional floor + `x`/`y` (plan cm), optional 1:1 link to an energy `Appliance`, notes |
| **Field value** | `DeviceFieldValue` (unique per device + field) | `source` (`manual` \| `home_assistant`), `haEntityId`, `haAttribute`, `value` (JSON), `valueAt` |

Contracts: `src/features/devices/types/devices.ts`. Fields and rules are JSON on the profile, validated by
`deviceProfileInputSchema` (unique keys, the primary field exists, operators fit the field type, values present).

**Field**: `key` (stable identifier), `label`, `type` (`boolean | number | text | choice`), `unit`, `choices`
(`[{ value, label }]` for `choice`), `trueLabel`/`falseLabel` (how a boolean reads: "Open"/"Closed"). One field is
the profile's `primaryField`: its value is shown next to the indicator ("21,5 °C").

**Rule**: `{ id, field, operator, value?, valueTo?, values?, tone, color?, label, icon?, pulse }`.
Operators per type: boolean `is_true`/`is_false`; number `eq neq gt gte lt lte between` (inclusive, bounds may be
swapped); text and choice `eq neq in`. `tone` is semantic (`success warning danger info neutral`, themed in light and
dark); `color` is an optional custom hex that overrides it.

## Rule engine

`evaluateIndicator(profile, values, { now })` in `types/indicator.ts` is pure and isomorphic (API and UI). Values are
coerced to the field type (`"on"`, `"21,5"`, `"unavailable"` → `true`, `21.5`, unknown). Rules run top to bottom and
the **first match wins**. A rule on an unknown or **stale** value never matches. No match → fallback tone and
label (the UI says "Unknown" or "No recent data"). The result also reports `unknown`, `stale` and the primary
field's value. Staleness only applies to `home_assistant` sources: a value older than the profile's
`staleAfterMinutes` (null = never) counts as unknown. Tests: `src/api/devices/indicator.test.ts` (`npm test`).

**Presets** (`types/device-presets.ts`, EN + NL) create normal editable profiles: window/door contact, temperature &
humidity (<18 info, 18–24 success, >24 warning), washer/dryer (power > 5 W → success pulse "Running", else "Idle";
`remainingMinutes`), alarm panel (disarmed / armed_home / armed_away / triggered → neutral / warning / info / danger
pulse), smoke detector / alarm component (triggered, bypassed, battery), light (on, brightness), motion.

## API (`/api/devices`, household-scoped)

| Method | Path | Who |
|---|---|---|
| GET | `/` (devices + profiles), `/:id` (device + profile), `/profiles`, `/profiles/:id`, `/presets` | everyone |
| POST/PUT/DELETE | `/`, `/:id`, `/profiles`, `/profiles/:id`, `POST /presets/:key` (in the user's locale) | owner, adult |
| PUT | `/:id/position` `{ floorId, x, y }` or all null · `/:id/bindings` · `/:id/values/:fieldKey` `{ value }` | owner, adult |

A profile in use cannot be deleted (409). Setting a manual value on a field bound to Home Assistant is a 409.
Removing a field from a profile deletes its values; changing a device's profile clears its values.
`setDeviceValue(householdId, id, field, value, "home_assistant")` in `devices.service.ts` is the entry point for the
phase-8 sync.

## Live updates (Server-Sent Events)

Generic infrastructure, not device-specific:

- Server: `src/api/lib/events.ts`: `publish(householdId, type, data)` / `subscribe(...)`, in-memory per household,
  and `GET /api/events` (session cookie auth, 401 without). Headers: `text/event-stream`, `Cache-Control: no-cache,
  no-transform`, `X-Accel-Buffering: no`; `retry: 5000`; a `: ping` comment every 25 s.
- Browser: `src/lib/live-events.ts`: `useLiveEvents(type, handler, { enabled })` shares one `EventSource` per page,
  reconnects with backoff when the server refuses; `useLiveEventsStatus()` for a "Live" badge.
- Envelope (`src/types/live-events.ts`), one SSE message per event:

```
id: 42
event: device.value
data: {"type":"device.value","at":"2026-10-02T18:00:00.000Z","data":{"deviceId":"…","fieldKey":"isOpen","value":true,"updatedAt":"…","source":"manual"}}
```

Events: `ready` (each (re)connect; nothing is replayed, so reload data), `device.value` (`DeviceValueEvent`),
`device.changed` (`{ deviceId, profileId, action }`; reload). `useLiveDevices()` patches values in place and
revalidates on `device.changed` and on reconnect. Home Assistant will publish into the same bus.

**nginx**: the stream must not be buffered or compressed. Add to the site config:

```nginx
location /api/events {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_cache off;
  gzip off;
  proxy_read_timeout 1h;
}
```

## Floor plan integration (no coupling)

Places has a **generic marker layer** and knows nothing about devices (`@/features/places`):

- `PlanMarker`: `{ id, x, y, tone, color?, label, icon?, value?, pulse?, dimmed? }` (x/y in plan cm; `icon` any SVG
  component such as a lucide icon). Also `PlanMarkerDot`, `PlanLegend`, `PlanMarkerPaletteItem`.
- `FloorPlanCanvas` / `FloorPlanEditor` / `FloorPlanScreen` accept `markers`, `selectedMarkerId`, `onMarkerClick`,
  `onMarkerMove(id, x, y)` (placement: drag markers, drop palette items; grid snap, Alt = free) and, in the editor,
  `markerPalette` (a slot above the plan). Marker positions are not part of the plan document or its undo history;
  the caller saves them.
- `FloorPlanView`: read-only plan with markers and a `legend` slot.

Devices turns devices into markers (`useDeviceMarkers`, `evaluateIndicator`) and the **routes compose**:
`src/routes/floor-plan.tsx` adds `useDevicePlanLayer(...)` (markers, palette of unplaced devices, immediate
position saves); `/house` (`HouseScreen`) shows `FloorPlanView` per floor tab with indicators, legend and a side
panel.

## Screens

`/devices` (by place, filter by category/profile, state chips) · `/devices/:deviceId` (values, manual controls,
value sources, place and plan) · `/devices/profiles` (profiles + presets) · `/devices/profiles/:profileId` (`new`
for a blank one; fields and rules editor with a live preview) · `/house` (live view) · the floor plan editor
(device palette). Children see everything and change nothing.

## Home Assistant (as built)

See [INTEGRATIONS.md](INTEGRATIONS.md#home-assistant-as-built-2026-10-03). In short:

- **Binding**: under a device's value sources, *Browse* opens Home Assistant's entity browser (search by name,
  entity id, area or domain; by default only entities that fit the field type; then the state or one
  attribute). The route composes it: `DeviceDetailScreen` / `DeviceBindingsForm` take a `renderEntityPicker`
  slot and know nothing about Home Assistant. Typing the entity id still works.
- **Live values**: after saving, `src/api/home-assistant/ha-device-sync.ts` applies the entity's current state
  at once and then every `state_changed` (also attribute-only updates) through `setDeviceValue(…,
  "home_assistant")`, so `valueAt` moves with every report and `device.value` streams over SSE. The job
  `home-assistant.refresh-states` (every 15 min) re-applies states Home Assistant reported again without a
  change. The devices service tells the sync about changes through `device-hooks.ts` (`emitDevicesChanged`
  in `changed()`).
- **Mapping**: on/off, open/closed, detected/clear → boolean; numeric states or attributes → number; alarm
  states onto the alarm preset's options (armed_night → armed_home, armed_vacation → armed_away); a choice
  that doesn't fit, `unavailable` or `unknown` (device offline) → unknown, so the indicator falls back.
- **Import**: the Home Assistant page suggests devices (door/window contacts → contact, temperature sensors →
  climate, the alarm panel → alarm panel, washer/dryer power → washer/dryer, motion, smoke) and creates them
  with a profile from the preset (reused when one exists) and the main field bound.
- **House page**: the route adds the alarm card on top of the side panel (`asideTop` slot); the side panel
  also shows the temperature per room on the floor (`RoomTemperatures`: average of the room's °C devices,
  stale values left out).

## Known gaps

- No value history, no notifications ("window open while armed"), no click-to-place for touch/keyboard (palette
  uses HTML drag and drop; editing is desktop-only anyway).
- The event bus is in-memory (one process). More processes → Postgres `LISTEN/NOTIFY` behind `publish`/`subscribe`.
