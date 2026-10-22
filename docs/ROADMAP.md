# WickedHome — Feature Roadmap

WickedHome is the household hub: one place that knows and manages everything about the home.

Two missions:

- **Functional**: manage places, tasks, shopping, stock, calendar, habitants, bills and subscriptions, and
  later the house itself through Home Assistant (alarm, climate, appliances).
- **Coding**: be a well-structured, maintainable codebase.

## Guiding principles

1. **The app works without AI.** Every action exists in the UI first. The assistant (local LLM, voice,
   MCP) is an optional layer that calls the *same* domain services through tools, never a separate path.
2. **Everything has a place.** Rooms and outdoor zones are the backbone. Tasks, stock, shopping items and
   devices hang off a place, and inside/outside follows from where something is.
3. **One shopping system.** Weekly groceries, materials for a job, and stock running low all end up on
   the same lists, grouped by shop.
4. **Home Assistant is the device hub.** WickedHome never talks to appliances or the alarm directly. It
   reads and acts through Home Assistant.
5. **Bilingual from day one.** English and Dutch (nl-BE formatting), EUR only.
6. **Every picker remembers.** Any selection (shop, product, place, habitant…) shows **Favourites** and
   **Recently used** above the full list, so reselecting is one tap. One shared picker component and two
   generic tables (`favorites`, `recent_selections`) make this automatic for every new domain.

---

## Domains

Each domain becomes a `features/<domain>` folder on both the web and API side.

| Domain | What it owns |
|---|---|
| `auth` | Accounts, sessions, passkeys, invites |
| `household` | The household and its habitants (adults, kids, pets, guests), roles |
| `places` | Floors, rooms, outdoor zones, the 2D floor plan editor |
| `tasks` | Jobs inside and outside, recurrence, assignment, required materials |
| `shops` | Physical shops and webshops, their details, product links |
| `shopping` | Shopping lists and items, where items come from, shop view, bought state |
| `inventory` | Stock of products per place, barcode/QR scanning, minimum thresholds |
| `recipes` | Recipes with ingredients linked to products, the "To cook" list (only missing ingredients go on the shopping list) and a flexible step-by-step cooking view ([RECIPES.md](RECIPES.md)) |
| `calendar` | Household calendar, store visits, derived events, Google Calendar sync |
| `expenses` | Finance: one-off and recurring expenses (bills, subscriptions, loans, everyday spending), who pays, payment QR ([FINANCE.md](FINANCE.md)) |
| `income` | Finance: recurring incomes per member or joint (fixed with amount history, or variable like meal vouchers), one-off incomes, meal voucher balances ([FINANCE.md](FINANCE.md)) |
| `money` | Finance: joint current and savings accounts with ledger and corrections, contributions, the monthly money flow ([FINANCE.md](FINANCE.md)) |
| `projects` | Finance: open-ended budget pots (renovation, holiday, trip, Christmas…) with linked tasks, materials and expenses; spent / committed / remaining ([PROJECTS.md](PROJECTS.md)) |
| `documents` | Folders and files like a drive, stored on the server (Google Drive later), attachable to anything |
| `devices` | Things on the floor plan with live state: sensors, appliances, alarm parts; configurable fields and indicator rules |
| `energy` | Electricity and gas (water later): use per period, appliances, solar panels, home battery, per-appliance breakdown, capacity peak |
| `dashboard` | Today, upcoming, overdue, ready-to-start jobs, money this month |
| `weather` | Forecast for the home address (Open-Meteo, KMI/IRM or Google) on the dashboard |
| `waste` | Waste collection days from the local collector (Limburg.net, Recycle!), on the calendar and dashboard |
| `settings` | The settings page: household and address, weather source, waste collector, later automations and integrations |
| `integrations` | Google (Gmail, Calendar), Home Assistant, connection health |
| `home` | Home Assistant data: alarm state, temperatures, appliances (read first, act later) |
| `assistant` | Chat, voice, tool calling against LM Studio, MCP server |
| `notifications` | In-app, web push, digests |

---

## How the core domains connect

```
                ┌────────────┐
                │   places   │  floors · rooms · outdoor zones
                └─────┬──────┘
      located in ┌────┴─────────────┬──────────────────┐
           ┌─────▼────┐      ┌──────▼─────┐     (home: devices, sensors)
           │  tasks   │      │ inventory  │
           └─────┬────┘      └──────┬─────┘
   needs materials│                 │ below minimum
           ┌─────▼─────────────────▼─────┐        ┌────────┐
           │       shopping items        ├───────►│ shops  │ buy at · product links
           └─────────────┬───────────────┘        └───┬────┘
                         │ shown during               │
                   ┌─────▼──────┐  store visit ◄──────┘
                   │  calendar  │
                   └────────────┘

   places ──located in──► appliances ──measured by──► energy meters ◄── Home Assistant (later)
                                                           ▲
                          grid · solar · battery ──────────┘
```

**Example.** Task *"Insulate the jacuzzi"* (place: Garden › Jacuzzi) needs *insulation boards* and a
*nail gun*. Both become shopping items linked to the task, with Gamma as the preferred shop and a webshop
link on the nail gun. You plan *"Gamma, Saturday 10:00"* in the calendar. In the shop you open the Gamma
view and see every item to buy there, from groceries, tasks and low stock alike. You tick them off as
bought, and the task flips from *waiting for materials (0/2)* to *ready to start*.

---

## Features per domain

`MVP` = first usable release of that domain. `Later` = after it proves itself.

### Household & habitants
- MVP: household; habitants with name, avatar, colour, type (adult / child / pet / guest)
- MVP: habitants without login (kids, pets) next to members with an account
- MVP: roles `owner`, `adult`, `child` (child: own tasks, add to shopping lists)
- Done: accounts for the other household members: invite link + QR code (share sheet on phones), Settings →
  Accounts (roles, disable, sign out everywhere, password-reset link, remove) and Settings → My account
  (email, password, devices). See [ACCOUNTS.md](ACCOUNTS.md). Later: passkeys, emailed reset links.
- Later: birthdays → calendar, diet/allergies → shopping, chore points

### Places & floor plans
- MVP: floors (levels) plus an **Outside** plan for the garden, driveway, shed, jacuzzi…
- MVP: rooms and zones exist as data, so they can be created from a simple list *before* anything is drawn
- MVP: 2D editor: grid with snapping, draw rooms/zones as polygons, walls, doors, windows, labels
- MVP: click a room to see everything linked to it (tasks, stock, shopping items)
- Done: real dimensions and areas; **import an architect's plan** (PDF/PNG/JPG, stored in Documents), crop one
  drawing, calibrate (two points or 1:50/1:100), trace walls with thickness presets and face alignment, then
  **Fill room** from the walls, named from the PDF's room labels with an area check (see
  [FLOORPLAN-EDITOR.md](FLOORPLAN-EDITOR.md#importing-a-plan))
- Later: furniture; holes (columns) in filled rooms; snapping to the underlay's lines; devices from Home
  Assistant placed on the plan with live state (temperature per room, open doors, alarm zones)

### Tasks
- MVP: **type**: household chore, to-do, job (klus), maintenance, errand. The type is independent of the place
- MVP: title, notes, **optional** place (room/zone; inside/outside only shown when set), assignee(s), due date, priority
- MVP: recurrence (every N days/weeks, weekdays, seasonal like "every spring")
- MVP: **materials**: a task lists what it needs. Each material is a shopping item, or a product already
  in stock, which then gets reserved.
- MVP: readiness: *waiting for materials (n/m)* → *ready to start* → *done*
- MVP: views: mine, per habitant, per place (inside/outside), ready to start
- Done: the **total list** (everything open by day, today's progress, "All done"), an obvious "Repeats" switch with
  presets, linked tasks from other features (bins per waste collection, "Pay …" per expense), comments, on hold,
  "waits for" / related links between tasks (see [TASKS.md](TASKS.md))
- Later: photos before/after, time spent

### Shops
- MVP: **built-in Belgian catalogue**, seeded and editable: supermarkets (Colruyt, Delhaize, Carrefour, AH, Aldi,
  Lidl…), DIY (Gamma, Brico, Hubo…), drugstores, pharmacies, home, electronics, pets, garden and online shops
  (bol, Amazon.com.be, Coolblue…). Households add their own shops next to them. See `src/api/shops/belgian-shops.ts`
- MVP: name, type (supermarket, DIY, pharmacy, garden centre, webshop…), address, website, opening hours, notes
- MVP: favourite shops and recently used shops on top in every shop picker
- MVP: product links: the same product can be bought at several shops (URL, price, article number)
- MVP: add an item by pasting a webshop URL (fetches title, image and price from page metadata) or by just typing a name
- Later: price history, "cheapest shop" hint, store-aisle order for supermarkets

### Shopping
- MVP: lists (e.g. *Weekly groceries*, *DIY*, *Pharmacy*), items with quantity, unit, preferred shop, notes
- MVP: every item records **why** it is on the list: *manual*, *recurring staple*, *task material*, *low stock*
- MVP: **shop view**: everything to buy at one shop, across all lists, tick off as *bought*
- MVP: live sync between phones while shopping
- MVP: recurring staples (weekly groceries come back automatically)
- Later: "bought" offers to add the item to stock
- Done: meal planning → shopping list: a recipe on "To cook" adds only its missing ingredients (source *recipe*, "For Spaghetti"); see [RECIPES.md](RECIPES.md)

### Inventory (stock)
- MVP: products with barcode (EAN on the packaging) and/or our own printed QR labels
- MVP: stock per place (pantry in the kitchen, screws in the garage), quantity and unit
- MVP: **minimum threshold** per product. Dropping below it adds the product to the shopping list for its preferred shop.
- MVP: scan with the phone camera in the browser: *use one*, *add stock*, *what is this?*
- Done: **barcode auto-fill**: an unknown barcode (scanned or typed in the product form) is looked up in public product databases and pre-fills name, brand, size, category and photo; cached server-side, photos served locally (see [INVENTORY.md](INVENTORY.md))
- Later: print QR label sheets, expiry dates

### Calendar
- MVP: household calendar (month / week / agenda), events per habitant
- MVP: **categories** with colour and icon, filterable: holiday & trips, family activity, school, work, health/appointments,
  social, sport, household, other. Multi-day events (trips) show as one bar across the days
- Done: waste collection days as a read-only overlay (see [WASTE-WEATHER.md](WASTE-WEATHER.md))
- Done: the legend filters overlay sources too (expenses, waste collection, birthdays, tasks; `?sources=`)
- Later: Flemish school holidays and public holidays as a read-only overlay
- MVP: **store visits**: an event linked to a shop shows that shop's shopping list
- MVP: overlays: tasks with dates, bills due, renewals, birthdays
- Done: Google calendars per member as a read-only overlay (household or private), one-way publishing of chosen
  household categories (see [INTEGRATIONS.md](INTEGRATIONS.md))
- Later: two-way Google Calendar sync per member

### Finance (expenses, income, money flow, projects)
Bills and Subscriptions merged into **Expenses** (`/expenses`; `/bills` and `/subscriptions` redirect). Design and
decisions: [FINANCE.md](FINANCE.md).
- Done (phase 1): one-off and recurring expenses (subscriptions, loans, down payments, insurance…), kinds and
  status (pause / resume / end), payment methods incl. direct debits paid automatically, beneficiary/IBAN/BIC,
  structured communication or free reference, payer (joint / person / split), EPC payment QR, "Log an expense"
  for everyday spending, Upcoming / Recurring / History, calendar source, dashboard cards, migration of the
  subscriptions
- Done (phase 3): projects (`/projects`, [PROJECTS.md](PROJECTS.md)): budget pots with tag, places, dates, status
  and cover; linked tasks (blocked-by chains), materials with estimated prices and expenses (one-off and
  recurring); spent / committed / remaining with in budget / at risk / over budget; project picker and chips in
  tasks, expenses and shopping; project budgets on the money flow page; calendar source
- Done (phase 2): income (`/income`: recurring incomes per member or joint, fixed with amount history or variable
  with "enter this month's amount", one-off incomes, month totals, meal voucher balances), joint current and
  savings accounts with a ledger, opening balance and corrections ("set real balance"), paid joint expenses
  counted automatically, contribution plans vs recorded transfers, money flow page (`/money`), Finance nav
  group, dashboard money card and "Record income" quick action
- Later: meal vouchers expiring after 12 months; the assistant filling in variable incomes (meal vouchers);
  bank statement import to suggest corrections
- Later: Gmail detection: an invoice email becomes a draft expense (LLM-extracted, human-confirmed); drop the old
  `subscriptions` table once the owner has checked the migration

### Documents
- MVP: folders and files like Google Drive: breadcrumbs, grid/list, upload (drag & drop, several at once, progress),
  new folder, rename, move, search, sort, preview of images and PDFs, download, trash with restore
- MVP: stored **locally on the server** (`STORAGE_DIR`, outside the code), behind a storage-provider interface
- MVP: **attach documents to anything**: invoice on a bill, manual and warranty on an appliance, quote on a task,
  receipt on a shopping item. One generic link table, the same pattern as favourites
- Done: **Google Drive** as a second provider: linked Drive folders (browse, open, import a copy, keep in Drive) and
  "Save to Drive" (see [INTEGRATIONS.md](INTEGRATIONS.md))
- Later: OCR / LLM extraction ("this PDF is an Engie bill of € 84,20 due 15/11" → draft bill), expiry reminders for warranties

### Devices
Everything that has a state and a place: window/door contacts, thermostats, the dryer, smoke detectors, the alarm
panel, lights. Shown as coloured indicators on the floor plan.

- MVP: **device profiles** (types) with configurable **fields** (boolean, number with unit, text, choice) and
  **indicator rules** (condition on a field → colour, label, icon, pulse). Ready-made profiles: window/door contact,
  temperature/humidity, washer/dryer (power), alarm panel, smoke detector, light, motion sensor; all editable
- MVP: **devices**: name, profile, place, position on the floor plan, optional link to an energy appliance
- MVP: **field bindings**: manual value now, Home Assistant entity/attribute later
- MVP: **live floor plan**: indicators with legend; click for values; updates pushed live (Server-Sent Events)
- MVP: place devices by dragging them onto the plan in the editor
- Done (phase 8): Home Assistant feeds the bindings live (entity browser with *Browse*, "import devices from Home
  Assistant", `state_changed` → device values over SSE, temperature per room on the House page)
- Later: rules that trigger notifications ("window open while alarm armed"), history per field

Electricity and **gas** (heating) in kWh, with gas also in m³; water is modelled for later. How much the house used, where it came from (grid, solar, battery) and which appliances
used it. Built so it works with manual data today and fills itself once Home Assistant measures things.

- MVP: **appliances**: name, place (room/zone), category (heating, cooking, laundry, jacuzzi, EV, IT…),
  rated power and standby power, and whether something measures it
- MVP: **solar installation**: number of panels, Wp per panel, total kWp, orientation and tilt, inverter, install date
- MVP: **home battery** (installed next year): capacity (kWh), max charge/discharge power, install date.
  Modelled from day one so adding it later is a form, not a migration
- MVP: **data without Home Assistant**: import the Fluvius quarter-hour CSV of the digital meter, or enter meter
  readings by hand
- MVP: **overview per day / week / month / year**: consumed, imported, injected, produced by solar, self-consumption
  and self-sufficiency, battery in/out
- MVP: **breakdown per appliance**: measured appliances get their share; everything not measured goes into
  **Unknown**, so with nothing connected the house is 100 % unknown, and that share shrinks with every plug
  you add
- MVP: **gas**: Fluvius hourly gas export (m³/kWh with calorific value), manual gas meter readings, gas appliances
  (boiler, hob, fireplace); overview tabs Electricity | Gas | Total energy
- MVP: **monthly peak** (Flemish capacity tariff, electricity only): the highest quarter-hour of each month
- Done (phase 8): hourly data through Home Assistant's energy statistics (P1 port of the digital meter, smart plugs
  linked to appliances, inverter, battery, gas), best source per bucket so it never adds up with Fluvius
- Later: tariffs → cost per period and per appliance, linked to the electricity bill in `bills`
- Later: tips ("the jacuzzi used 31 % this month"), estimated use of unmeasured appliances (rated power × hours),
  water (smart water meter), heating vs. outside temperature (degree days)

- Grows with each phase: today's tasks, ready-to-start jobs, next store visit with its list, low stock,
  bills due, renewals, and later alarm state and temperatures

### Home address, weather and waste
See [WASTE-WEATHER.md](WASTE-WEATHER.md).
- Done: home address with coordinates (Geopunt, OpenStreetMap fallback, or by hand) in Settings
- Done: weather card on the dashboard; provider per household: Open-Meteo (default, fallback), KMI/IRM (unofficial app API), Google (API key)
- Done: waste collector per household: Limburg.net and Recycle! (most other municipalities); daily sync, calendar overlay, dashboard card ("put it out tonight"), a "put the bins out" task per collection day
- Later: more Walloon collectors (Hygea, BEP) if not in Recycle!, rain radar (KMI), a notification the evening before a collection, weather alerts

### Integrations
- Google OAuth per member: Gmail read-only (bill detection), Google Calendar
- Home Assistant: long-lived token, WebSocket API
- One settings screen showing every connection, its scopes, last sync and errors
- Done (phase 6, see [INTEGRATIONS.md](INTEGRATIONS.md) "Google as built"): Integrations page (`/integrations`,
  linked from Settings) with a card per integration; Google per person (own OAuth with PKCE, incremental scopes,
  encrypted refresh tokens, revoke on disconnect); Google calendars on the household calendar (choose calendars
  and who sees them, sync every 15 min with sync tokens) and optional one-way publishing of household event
  categories; bills from Gmail as suggested expenses on the Expenses page (Belgian sender rules, amount / due
  date / structured communication / IBAN from mail and PDF, PDF attached on Accept); Drive folders linked into
  Documents (browse, open, import a copy or keep in Drive) and "Save to Drive". Waiting for the owner's Google
  Cloud credentials (`GOOGLE_CLIENT_ID`/`SECRET`, `INTEGRATIONS_KEY`)
- Later: two-way calendar sync, Google push notifications instead of polling, better bill extraction by the
  assistant, Shared drives in the folder picker

### Home (through Home Assistant)
- Read: alarm state and history (Verisure integration), temperatures and humidity, appliance states
- Show on dashboard and floor plan
- Act, later: arming only with explicit confirmation. **Disarming is never exposed to the LLM or voice.**
- Done (phase 8, see [INTEGRATIONS.md](INTEGRATIONS.md)): alarm card (state, 7-day history) on the House page and
  dashboard; arming behind a confirmation (also as sensitive assistant tools); disarming only in the app with
  the code, owners/adults, rate-limited and audit-logged. Waiting for the owner's Home Assistant install.

### Assistant
- Chat panel everywhere, full screen on mobile, in the user's language
- LM Studio (LAN PC) over its OpenAI-compatible API, with **tool calling**: each domain contributes tools
  (`tasks.create`, `shopping.addItem`, `inventory.consume`, …)
- Confirmation step for money records, deletions and anything touching the house
- **WickedHome as an MCP server**, so LM Studio, Home Assistant or any MCP client can use the same tools
- Voice (see below)
- Done (see [ai/docs/ASSISTANT.md](../ai/docs/ASSISTANT.md)): tool registry with 15 seed tools (+ the alarm's), streaming chat
  `/assistant` and an Ask button on every page, confirmation cards ("don't ask again" only for harmless writes,
  money and arming always ask, disarm never a tool), conversations kept 90 days, MCP server with personal
  tokens, push-to-talk (local Whisper or the browser) and read-aloud. Waiting for the owner's LM Studio address
  and model.
- Later: audit log with `assistant:<user>` / `mcp:<token>` actors, more tools (stock use, snooze, mark paid),
  better bill extraction from Gmail PDFs

### Notifications
- MVP: in-app notification centre
- Later: web push (installed PWA), morning digest, per-habitant preferences
- Done (see [NOTIFICATIONS.md](NOTIFICATIONS.md)): notification centre (bell with live unread count,
  `/notifications`), Web Push to phones (VAPID key generated once, no setup), per-person preferences (kinds,
  times, quiet hours with an urgent bypass, devices), and notifications for bins, payments, the task digest,
  assigned / can-start tasks, the alarm, Home Assistant offline, device indicators, meal vouchers, mail bills and
  accepted invites.
- Later: weather warnings, "window open while the alarm is armed" rules, a notification per comment or
  @mention, snooze from the notification, email as a fallback channel

---

## Voice

Gemini on Android can't be pointed at a custom LLM or app, so there are two open routes, and they can
coexist:

1. **In-app push-to-talk**: open-source speech-to-text (Whisper, running on the LLM PC next to LM
   Studio) → LM Studio with WickedHome tools → reply as text and, optionally, speech (Piper TTS).
2. **Home Assistant Assist**: the Home Assistant companion app can be set as Android's default assistant,
   so the long-press that now opens Gemini opens Assist instead. Assist can use LM Studio as its brain and
   WickedHome's MCP tools, so a single voice controls both the house and the household.

Route 1 comes with the assistant phase. Route 2 comes once Home Assistant is running.

---

## Phases

| Phase | Goal | Contents |
|---|---|---|
| **0 — Foundation** | A skeleton that proves the methodology | Single app (React + `src/api` Express), Prisma + Postgres, auth, i18n (EN/NL), app shell, brand tokens, `components/ui`, Storybook, household & habitants, deploy to the server |
| **1 — Places** | The spatial backbone | Floors, rooms, outdoor zones, 2D floor plan editor, place detail page |
| **2 — Tasks & shopping** | Getting jobs done | Tasks with materials and readiness, shops, shopping lists, shop view, recurring staples |
| **3 — Stock & time** | The house restocks itself | Inventory, barcode/QR scanning, thresholds → shopping; calendar with store visits |
| **4 — Energy** | Know what the house uses | Appliances per place, solar installation, battery, Fluvius CSV import and manual readings, day/week/month/year overview, per-appliance breakdown with Unknown, monthly peak |
| **5 — Money** | Bills and subscriptions | Bills, subscriptions, reminders, energy tariffs and cost, dashboard money widgets |
| **6 — Google** | Outside world | Google OAuth, Calendar sync, Gmail bill/subscription detection, Google Drive as document storage. Built 2026-10-03; shows "not configured" until the owner adds `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and `INTEGRATIONS_KEY` |
| **7 — Assistant** | Talk to the house | LM Studio tool calling, MCP server, confirmations, in-app voice |
| **8 — Home Assistant** | The house itself | Alarm, temperatures, appliances, devices on the floor plan, **live energy data** (P1 meter, smart plugs, inverter, battery), **live device states** on the floor plan, Assist voice. Built 2026-10-03 (all but Assist voice); shows "not configured" until the owner adds `HOME_ASSISTANT_URL`/`TOKEN` |

The dashboard and notifications are not a phase. Every phase adds its own widgets and notifications.

---

## Notes and constraints

- **Gmail**: `gmail.readonly` is a restricted scope. Keep the Google Cloud project unverified but set to
  *In production*. In *Testing* mode, refresh tokens expire after 7 days.
- **Public exposure**: only the front end is public, but the browser has to reach the API, so nginx serves
  it on the same origin under `/api`. Postgres, LM Studio and Home Assistant stay LAN-only, and every API
  route requires a session.
- **Camera scanning** needs HTTPS. That's fine on the public domain, but over plain `http://` on the LAN
  it won't work.

## Open questions

1. Bills and subscriptions are now phase 4. Is that late enough, or are they more urgent than stock?
2. Domain name for WickedHome (e.g. `home.<domain>`)?
3. Node 20 on the server has been end-of-life since April 2026. Upgrade to Node 24 LTS (via nvm for the
   `wicked` user, so other apps are untouched)?
