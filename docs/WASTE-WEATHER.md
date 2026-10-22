# Home address, weather and waste collection

The household has a home address with coordinates (Settings → Household). The coordinates feed the
weather forecast; the address is the starting point for finding the household's waste collector. Waste
collection days appear on the calendar and the dashboard.

| Feature | Browser | API | Data |
|---|---|---|---|
| Address + coordinates | `features/household` (`HouseholdSettingsForm`, `types/household-settings.ts`) | `src/api/household/household-settings.service.ts`, `geocoding.ts` | `households.address*`, `latitude`, `longitude`, `locationSource` |
| Weather | `features/weather` (`WeatherCard`, `WeatherSettingsSection`) | `src/api/weather` (`providers/`, cache in memory) | `weather_settings` (chosen provider) |
| Waste | `features/waste` (`WasteCard`, `WasteSettingsSection`) | `src/api/waste` (`providers/`, sync, calendar source) | `waste_setups`, `waste_collections` |
| Settings page | `features/settings` (`/settings`, sections per feature) | — | — |

## Endpoints

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/household/settings` | all | name, address, location |
| PUT | `/api/household/settings` | owner, adult | save; geocodes a changed address (`geocode`: found, kept, manual, not_found, failed, cleared) |
| GET | `/api/weather` | all | forecast for the home (`no_location` / `unavailable` otherwise) |
| GET / PUT | `/api/weather/settings` | all / owner, adult | chosen provider, available providers, last delivery |
| GET | `/api/waste/settings` | all | setup, providers, suggested provider, next 4 days |
| GET | `/api/waste/summary` | all | dashboard: setup + next 3 collection days (6 weeks) |
| GET | `/api/waste/collections?from&to` | all | collection days in a range |
| POST | `/api/waste/lookup` | owner, adult | find the address at a provider → matches with the provider's ids |
| PUT | `/api/waste/setup` | owner, adult | save provider + match, then sync at once |
| PUT | `/api/waste/task-settings` | owner, adult | bins tasks: `{ enabled, timing, assigneeIds, rotate }`, applied to the open bins tasks at once |
| DELETE | `/api/waste/setup` | owner, adult | disconnect (removes the collections) |
| POST | `/api/waste/sync` | owner, adult | "Refresh now" (one per household per 30 s) |

All outbound calls go through `src/api/lib/fixed-host-fetch.ts`: https only, a per-call host allow-list,
no redirects, one timeout over request and body, a size cap, and error messages without URLs (which can
contain an address or a key). Addresses are never logged.

## Geocoding (address → coordinates)

1. **Geopunt geolocation** (`geo.api.vlaanderen.be/geolocation/v4/Location?q=…&c=1`), Digitaal
   Vlaanderen, backed by the Flemish address register (Basisregisters Vlaanderen). Free, no key,
   house-number precision, WGS84 in the response. Covers Flanders and Brussels; returns nothing for
   Wallonia, so Walloon postal codes (1300–1499, 4000–7999) skip it. A result only counts when its
   postal code matches.
2. **OpenStreetMap Nominatim** (`nominatim.openstreetmap.org/search`, structured query, `countrycodes=be`)
   as fallback: our own User-Agent, at most one request per second (queued in-process), © OpenStreetMap
   contributors (ODbL).

Considered: Basisregisters `adresmatch` (Flanders only, Lambert 72 coordinates that need a projection)
and BOSA BeSt Address (bulk files, no simple point lookup). Geocoding fails soft: the address is saved
without coordinates and the user can enter them by hand (Settings shows the result with a "View on map"
link to OpenStreetMap). Coordinates must lie in Belgium's bounding box.

## Weather

The household picks a provider in Settings → Weather. **Open-Meteo** is the default and the automatic
fallback: when the chosen provider fails (or isn't configured), Open-Meteo stands in and the card says
"(KMI/IRM unavailable)" next to the credit. Every forecast is normalised to one contract
(`features/weather/types/weather.ts`): current conditions, 12 hours, 7 days, a `condition` per entry
(icon + EN/NL label), metric units, local Brussels times.

Coordinates are rounded to 2 decimals (~1 km) before they leave the server. The cache lives in memory,
per provider and location: fresh for 30 minutes, a failing provider is retried at most once a minute,
and when everything fails an older forecast (≤ 6 h) is shown as stale.

| Provider | Endpoint | Key | Notes |
|---|---|---|---|
| Open-Meteo | `api.open-meteo.com/v1/forecast` | none | Free for non-commercial use (< 10 000 calls/day). Credit "Weather data by Open-Meteo.com" (CC BY 4.0) is shown on the card. WMO weather codes. |
| KMI/IRM | `app.meteo.be/services/appv4/?s=getForecasts&k=…&lat=…&long=…` | daily md5 key computed like the app does | **Unofficial**: the API of KMI's mobile app (also used by the Home Assistant `irm_kmi` integration), undocumented and may change. Belgian point forecast, KMI pictogram codes 0–27. No feels-like, humidity or gusts. KMI's open data (`opendata.meteo.be`) has observations and model grids, not a ready point forecast. |
| Google | `weather.googleapis.com/v1/{currentConditions,forecast/hours,forecast/days}:lookup` | `GOOGLE_MAPS_API_KEY` | Google Maps Platform Weather API; needs a key with the Weather API enabled and billing on. Read server-side only, never sent to the browser. Without it the option shows "not configured" and can't be chosen. |

Condition mappings live next to each adapter (`weatherCondition` for WMO in the contract,
`kmiCondition`, `googleCondition`) and are unit-tested.

## Waste collection

### Providers

| Provider | Coverage | Status |
|---|---|---|
| **Limburg.net** (`providers/limburg-net.ts`) | All municipalities of the province of Limburg (postal codes 3500–3999) | Implemented. These municipalities are listed in Recycle! but marked unavailable there. |
| **Recycle! / Fost Plus** (`providers/recycle-app.ts`) | Most other Belgian municipalities: IVAGO (Ghent), IVBO, Mirom, IMOG, Interza, Ecowerf, IOK, IGEAN, ILvA, Intradura, Verko, Incovo, Bruxelles-Propreté, Intradel, BEP, ipalle, IDEA… | Implemented. Coverage is checked per postal code at lookup (`available`). |
| Hygea (Mons-Borinage), BEP Environnement (Namur), Ittre | Some Walloon municipalities publish their own calendars | Not implemented. The Home Assistant `waste_collection_schedule` project has scrapers (`hygea_be`, `bep_environnement_be`, `ittre_be`); check first whether the municipality is in Recycle!. |

The provider is **suggested** from the home's postal code (a provider with a fixed range first, else
Recycle!), but the user chooses. Labels stay the provider's own ("Pmd", "Papier & karton"); Recycle!
labels are Dutch, or French for Walloon postal codes.

**Limburg.net** — the JSON API behind limburg.net/afvalkalender (`limburg.net/api-proxy/public`):

```
GET /afval-kalender/gemeenten/search?query=Hasselt                → [{ nisCode, naam }]
GET /afval-kalender/gemeente/<nis>/straten/search?query=…          → [{ nummer, naam }]
GET /afval-kalender/straat/<nummer>/huisnummers/search?query=…     → [{ huisNummer, toevoeging }]
GET /kalender/<nis>/<YYYY-MM>?straatNummer=&huisNummer=&toevoeging= → activiteitenLegende + ophalingen.lijstVanOphaalDagen
```

One request per month in the sync window. Dates are local timestamps; holiday shifts are already
applied. It wants the main municipality ("Hasselt", not "Kermt"). The same ids make up its ICS feed
(`limburg.net/ics/afvalkalender/<nis>/<street>/<number>/<addition>`).

**Recycle!** — `api.fostplus.be/recyclecms/public/v1` with header `x-consumer: recycleapp.be`:

```
GET  /zipcodes?q=9000                       → items[{ id: "9000-44021", available, city }]
POST /streets?q=Veldstraat&zipcodes=<zip>   → items[{ id: "https://data.vlaanderen.be/id/straatnaam-…", name, names }]
GET  /collections?zipcodeId&streetId&houseNumber&fromDate&untilDate&size=100&page
```

Items with `exception.replacedBy` moved to another day and are skipped; the replacement is listed itself.

Verified on 2 October 2026 with public sample addresses: Limburg.net (Kempische steenweg 100, Hasselt:
91 collections over 4 months), Recycle! (Veldstraat 1, Ghent: 56; Rue de Namur 1, Nivelles: 31;
Hasselt correctly "not covered").

### Fractions

Normalised by keyword (`normaliseFraction`, NL/FR/DE/EN): residual, organic (GFT, keukenafval), pmd,
paper, glass, textile, garden, bulky, other. Recycle! sends its own colours; otherwise each fraction has
a default colour and icon.

### Sync

`syncWaste(householdId)` replaces the window from 7 days back to 120 days ahead in one transaction
(delete + insert, unique per household/day/provider key), so running it twice gives the same result.
A provider error, or an empty answer when collections exist, keeps the stored collections and records
the error on the setup (`lastSyncStatus`, `lastSyncError`, `lastSuccessAt`). Collections older than
400 days are pruned. Saving a different provider or address removes the old collections first.

Scheduled: the job `waste.sync` (`src/api/waste/waste.jobs.ts`, every day at 05:15 Brussels time, caught
up once after a restart that missed it) calls `syncAllWasteSetups(ctx)`, which syncs every household with
a setup and returns a short summary; the run is marked failed when a setup failed. Its runs, a pause switch
and "Run now" are under Settings → Automations ([AUTOMATIONS.md](AUTOMATIONS.md)). "Refresh now" calls the
per-household sync.

### Bins tasks

Settings → Waste collection has **"Create a task to put the bins out"** (on by default, `waste_setups.task*`):
when (the evening before at 20:00, or the morning of the collection at 07:00) and optionally who, taking turns
(one person per collection day, after whoever had the previous one) or all of them on every task.

Each collection day from today up to 14 days ahead gets one linked task (see [TASKS.md](TASKS.md)): origin
`waste:<collection date>`, type chore, titled "Put out: Papier & karton + Pmd" (in the first owner's
language), due accordingly, linking to `/settings#waste`. `planWasteTasks` (`src/api/waste/waste-tasks.ts`,
pure and unit-tested) decides; `syncWasteTasks` applies it after every sync (`syncWaste`: the daily job,
"Refresh now", saving the collector, also when the fetch failed) and when the setting changes:

- a moved collection (same bins, at most a week away) moves its open task along, keeping assignee, notes and comments;
- open tasks for days without a collection (cancelled, passed) are removed; done and skipped ones are never touched;
- switching it off, or disconnecting the collector, removes the open bins tasks;
- a task a person assigned (within the chosen people) keeps its assignee; a snoozed task keeps its date.

### Calendar

The `waste` calendar source (registered in `waste.routes.ts`) turns each collection day into one
read-only all-day entry, kind `waste` (trash icon, green), titled "Pmd + Papier & karton", linking to
`/settings#waste`. Its legend chip ("Waste collection", `labelKey: "waste:calendarSource"`) shows or hides
it (`?sources=waste`).

## Adding a waste provider

1. Add its id to `WASTE_PROVIDER_IDS` in `features/waste/types/waste.ts`.
2. Create `src/api/waste/providers/<id>.ts` implementing `WasteProvider` (`provider.ts`): `info` (name,
   website, postal-code ranges when fixed, or `checksCoverage`), `lookup` (address → matches with the
   provider's own ids, or a `problem`), `parseAddress` (a zod schema for the stored ids) and
   `fetchCollections(address, from, to)`.
3. Only call the provider's fixed host(s) through `fetchJsonFromFixedHost`; never log the address.
4. Export the parsing as a pure function and test it with a trimmed real response
   (`providers/providers.test.ts`).
5. Register it in `providers/index.ts` and add a hint in `features/waste/locales/{en,nl}.json`
   (`providers.<id>.hint`).

## Adding a weather provider

1. Add its id to `WEATHER_PROVIDER_IDS`, a name in `WEATHER_PROVIDER_NAMES` and a credit in
   `WEATHER_ATTRIBUTIONS` (`features/weather/types/weather.ts`).
2. Create `src/api/weather/providers/<id>.ts` implementing `WeatherProvider`: `info`, `isConfigured()`
   (e.g. an API key in `src/api/lib/config.ts`) and `fetchForecast(lat, lon)` returning the normalised
   forecast; map its condition codes to `WeatherCondition`.
3. Fixed hosts via `fetchJsonFromFixedHost`, coordinates rounded to 2 decimals, keys server-side only.
4. Test the parsing and the condition mapping (`providers/providers.test.ts`), register it in
   `providers/index.ts`, and add its description in `features/weather/locales` (`settings.providers.<id>`).
