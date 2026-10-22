# Energy — design notes

Electricity and gas; water is modelled for later. Research checked October 2026 (Flanders, Fluvius, Home Assistant).

## Data sources, in the order they arrive

| Source | When | What it gives |
|---|---|---|
| Manual meter readings | Now | Cumulative register values (offtake day/night, injection day/night, inverter total) at a moment |
| **Fluvius CSV** (Mijn Fluvius → verbruikshistoriek, quarter-hour totals) | Now | kWh per 15 min for `Afname Dag`, `Afname Nacht`, `Injectie Dag`, `Injectie Nacht`. **No solar production** |
| Home Assistant (P1 port via DSMR `5B` or HomeWizard, smart plugs, inverter, battery) | Phase 8 | Hourly (or 5-min) kWh per sensor via `recorder/statistics_during_period`, sensor list via `energy/get_prefs` |

### Fluvius CSV format
- Name: `Verbruikshistoriek_elektriciteit_<EAN>_<from>_<to>_kwartiertotalen.csv` (gas: separate `_uurtotalen` file).
- UTF-8 with BOM, `;` delimiter, `,` decimals, `DD-MM-YYYY` + `HH:MM:SS`, local Belgian time without offset.
- Header (NL): `Van datum;Van tijdstip;Tot datum;Tot tijdstip;EAN;Meter;Metertype;Register;Volume;Eenheid;Validatiestatus`
- English site: `From (date);From (time);Until (date);Until (time);EAN code;…;Register;Volume;Unit;Validation status`,
  `DD/MM/YYYY`, registers `Offtake Day/Night`, `Injection Day/Night`.
- Long format: one row per register per interval. `Volume` is kWh for the interval (power = kWh × 4). Empty volume
  with status `Geen verbruik`; other statuses `Gevalideerd`, `Geschat`. EAN is wrapped as `="…"`.
- Parse defensively: match headers loosely (NL/EN, with or without parentheses), handle both date formats, the DST
  autumn hour (duplicate local times → resolve with Europe/Brussels rules), single-tariff meters.
- Parsing happens **in the browser** (no file upload infrastructure needed); parsed intervals are posted to the API in
  batches and upserted, so re-importing an overlapping file is safe.

### Belgian meter registers
`1-0:1.8.1` offtake day, `1-0:1.8.2` offtake night, `1-0:2.8.1` injection day, `1-0:2.8.2` injection night
(Belgium: tariff 1 = day, unlike the Netherlands; keep labels configurable). `1-0:1.6.0` = maximum demand this month.

## Gas

Gas is a second **carrier** next to electricity (`EnergyCarrier`: `ELECTRICITY | GAS | WATER`). A meter has a
carrier and a kind: the gas meter is `GRID_IMPORT` + `GAS`, a gas sub-meter `APPLIANCE` + `GAS`. Solar and
battery are electricity only. Energy is always stored as integer **Wh**; gas intervals and readings also keep
the native volume (`volumeLitres` = m³ × 1000) and the calorific value used (`calorificWhPerM3`).

### Fluvius gas CSV
- Name: `Verbruikshistoriek_gas_<EAN>_<from>_<to>_uurtotalen.csv`: **hour** totals, same layout as electricity.
- `Register` = `Afname` (EN `Offtake`); no day/night, no injection.
- `Eenheid` is `m³` or `kWh`, and an export can carry **both**: one row per unit for the same hour. Rows of one
  hour merge into one interval: kWh is used as is, m³ is kept as the volume.
- Extra column `Calorische Bovenwaarde` (EN: *calorific value* / *gross calorific value*), the gross
  calorific value in kWh/m³ (≈ 11,2–11,6 for Belgian H-gas; read as MJ/m³ ÷ 3,6 when around 40).
- When only m³ is given: **kWh = m³ × calorific value** (from the row, else the household default).
- Electricity vs gas is detected automatically: file name (`_gas_` / `_elektriciteit_`), a calorific
  column, or most rows in m³. Hourly rows keep their wall-clock length across DST like quarter-hours.

### Manual gas readings
Gas meter readings are entered in m³ and converted with the household's **default calorific value**
(`EnergySettings.gasCalorificWhPerM3`, default 11,4 kWh/m³, editable under Solar, battery & gas). Both the m³
and the kWh are stored (with the calorific value used), so every conversion stays traceable.

### Summary and screens
`GET /api/energy/summary?carrier=electricity|gas|total`. Gas: consumption = offtake (kWh and m³), breakdown per
gas appliance with its own **Unknown**. Total: electricity + gas consumption in kWh; unknown when one carrier
has data but its consumption can't be computed. The capacity peak is electricity only (same in every view).
Per bucket only the best source with data counts (Home Assistant > Fluvius > manual), so sources never add up.
Appliances list the carriers they run on (a gas boiler: gas + electricity for its pump; a gas hob: gas).

### Gas via Home Assistant (phase 8)
The P1 port reports the gas meter as OBIS `0-1:24.2.3` (cumulative m³, Belgian meters every 5 min; Dutch
`0-1:24.2.1`). HA's DSMR integration exposes it as a `sensor.gas_meter_gas_consumption` (m³) statistic, listed
in `energy/get_prefs` as `{type: "gas", stat_energy_from}`. Pull hourly `change` values, store them as gas
intervals with `volumeLitres` and convert with the calorific value (Fluvius' monthly value or the default).

## Formulas

With I = grid import, E = export, S = solar production, Bc = battery charge, Bd = battery discharge (kWh per period):

- **Home consumption** C = I + S + Bd − E − Bc
- **Self-sufficiency** = 1 − I / C
- **Self-consumption** = solar used on site / S; without battery (S − E) / S
- **Unknown** = C − Σ measured appliances, clamped at 0. With nothing measured, Unknown = 100 %.
- If S is not measured (Fluvius data only), electricity C cannot be computed: show import/export and a clear
  "solar production not measured" notice instead of a wrong number.

## Capacity tariff (Flanders)
- **Monthly peak** = highest 15-minute average **offtake** power in a calendar month (kW = kWh in the quarter × 4,
  day + night registers together). Injection doesn't count. Billing uses at least **2.5 kW** per month.
- Yearly figure = average of the last 12 monthly peaks; ±€53/kW/year excl. VAT in 2026 (varies by grid area).

## Tariffs (Money phase)
Tariff components with a validity range: `per_kwh` (single / day / night / dynamic), `per_kwh_export` (injection
compensation), `per_kw_peak` (capacity), `per_year_fixed` (supplier fee, data management). Network offtake has no
day/night split since 2023.

## Home Assistant mapping
- Auth: WebSocket `/api/websocket`, long-lived token.
- Discover sensors with `energy/get_prefs`: grid entries (new flat shape `{type:"grid", stat_energy_from, stat_energy_to}`
  and legacy `flow_from[]/flow_to[]`), `solar.stat_energy_from`, battery `stat_energy_from` (discharge) /
  `stat_energy_to` (charge), `device_consumption[].stat_consumption` (+ `included_in_stat` to avoid double counting).
- Pull `recorder/statistics_during_period` with `period: "hour"`, `types: ["change"]`; `change` = kWh in the bucket.
  Store as intervals with source `home_assistant`.

### As built (2026-10-03)
Job `home-assistant.energy` (hourly at :07, catch-up after a restart; the first connection starts it at once),
code in `src/api/home-assistant/ha-energy.ts` + `ha-energy-prefs.ts`, helpers in `energy.service.ts`
(`ensureHomeAssistantMeter`, `upsertMeterIntervals`, `linkHomeAssistantStatistic`, `listHomeAssistantMeters`).

- **Meters**: one `EnergyMeter` per statistic (`source = HOME_ASSISTANT`, `haStatisticId`). Grid import/export,
  solar, battery and gas come from the preferences automatically; the register follows the statistic id
  (`…_tariff_1`, `…_tarif_1`, `…_t1` → day; 2 → night; else single). Device-consumption statistics become
  `APPLIANCE` meters only when linked to an appliance on the Home Assistant page; unlinking deletes the meter
  and its intervals.
- **Hours**: requested in kWh (`units: { energy: "kWh", volume: "m³" }`) per 7-day window; Wh = change × 1000;
  missing and negative changes are skipped. Gas: `recorder/get_statistics_metadata` says m³ or kWh; m³ keeps
  `volumeLitres` and converts with the household's calorific value.
- **From when**: per meter its last stored hour minus 3 hours (Home Assistant corrects recent hours), or the first
  time `energyBackfillDays` (default 30) back, rounded down to local midnight on the first of that month, so
  month buckets are whole. Only complete hours (up to the start of the current hour).
- **Idempotent**: upsert on (meter, start, end); a rerun reports "0 new, n updated".
- **No double counting**: the summary keeps per bucket and kind only the best source (Home Assistant > Fluvius >
  manual), and capacity peaks only use quarter-hours (Home Assistant hours never change them). Nested devices
  (`included_in_stat`): when parent and child are both linked, the parent's hours are stored minus the
  children's, so the breakdown and Unknown count each Wh once; changing a nested link re-imports the parent.
- **Known gap**: if Home Assistant has a gap inside a month, that month's year-view bucket uses Home Assistant
  only (best source per bucket), while day and week views fall back to Fluvius for the missing days.
