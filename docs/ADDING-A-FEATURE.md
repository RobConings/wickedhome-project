# Adding a feature

A feature is one business domain (habitants, places, shops, bills, energy…). It owns its data model, its
API, its UI and its translations. This is the checklist; [ARCHITECTURE.md](ARCHITECTURE.md) explains why.

## 1. Files a feature owns

```
prisma/schema/<feature>.prisma           data model (models + enums for this domain only)
src/api/<feature>/
  <feature>.routes.ts                    Express router: auth, validation, HTTP → service
  <feature>.service.ts                   business logic + Prisma; the only code routes and assistant tools call
src/features/<feature>/
  types/<feature>.ts                     zod schemas + types: the contract shared by API and UI
  data/<feature>-requests.ts             fetch functions (api client)
  data/<feature>-loaders.ts              React Router loaders and actions
  components/<thing>.tsx                feature components
  screens/<page>-screen.tsx              full pages
  locales/en.json, locales/nl.json       translations, namespace = feature name; always both languages
  index.ts                               public API: the only file other code may import
src/routes/<page>.tsx                    thin route file: loader/action + render one screen
stories/features/<feature>/
  components/<thing>.stories.tsx         one story file per component…
  screens/<page>-screen.stories.tsx      …and per screen
  fixtures.ts                            example data for the stories
```

Use kebab-case file names that say what they are (`habitant-card.tsx`, not `card.tsx` or `helpers.ts`).

## 2. Rules that keep features independent

- **Other features**: import only from `@/features/<other>` (its `index.ts`). Lint enforces it.
- **The API** may import `@/features/<feature>/types/*` (contracts) and `@/types/*`, nothing else from the browser side.
- **Contracts** use lowercase string enums (`"adult"`). Prisma enums are UPPERCASE (`ADULT`); the service maps between them.
- **Household scoping**: every query filters on `currentUser(req).householdId`. An id from another household
  is a 404, never a 403.
- **Roles**: mutations require `requireRole("owner", "adult")` unless children are explicitly allowed
  (e.g. adding to a shopping list).
- **Money** is integer cents (EUR). **Dates** are `YYYY-MM-DD`; timestamps are ISO strings; the household time zone is `Europe/Brussels`.
- **Dates: always through `@/types/date-format`, dd/mm/yyyy** (`formatDate` → "30/10/2026", `formatDateTime` →
  "30/10/2026 14:05", 24 h, Brussels wall clock), in both languages, in the browser and in server texts
  (notifications, task titles, assistant summaries). Never `Intl.DateTimeFormat` / `toLocaleDateString` for a
  shown date. Words only for month headers (`formatMonth` → "oktober 2026"), chart ticks, calendar grids and
  relative words ("vandaag").
- **Recurrence** is an RFC 5545 RRULE string.
- **Pickers**: every selection of an entity (shop, place, product, habitant…) uses the shared
  `EntityPicker` (`components/shared/entity-picker.tsx`), which shows **Favourites** and **Recently used**
  first. Record a use with `POST /api/selections/recent` when a selection is saved.
- **UI text** is never hard-coded: `useTranslation("<feature>")`, and `common` for generic words.
- **Every component and screen gets a story** in `stories/` (never next to the component), titled
  `Features/<Feature>/Components/<Name>` or `Features/<Feature>/Screens/<Name>`, using the feature's
  `stories/features/<feature>/fixtures.ts`. Stories import the code under test via `@/…`.

**Using the picker.** Add your entity type to `SELECTION_ENTITY_TYPES` in `src/types/selections.ts`. Then
`const { favoriteIds, recentIds, toggleFavorite, recordUse } = useSelections("place")` (`@/lib/selections`)
and render `<EntityPicker name="placeId" items={places.map(toItem)} favoriteIds={favoriteIds}
recentIds={recentIds} onToggleFavorite={toggleFavorite} />`. Call `recordUse(id)` after the form saves.
Wrap it once in your feature (like `ShopPicker` in `@/features/shops`) so other features reuse yours.

**Background work: register a job, never use `setInterval`.** Anything that runs on its own (syncing,
retrying, cleaning up) is a scheduled job: `registerJob({ id: "<feature>.<name>", schedule: "15 5 * * *",
titleKey, descriptionKey, run })` in `src/api/<feature>/<feature>.jobs.ts`, imported once from your
routes file, with `jobs.<name>.title/description` in your locales. The scheduler handles the time zone,
locking, timeouts, the run log and catch-up after a restart, and the job shows up under Settings →
Automations with a pause switch and "Run now". See [AUTOMATIONS.md](AUTOMATIONS.md).

## 3. Shared touchpoints (small, careful edits)

These files are shared by all features. Re-read them right before editing and change only your lines.

| File | What to add |
|---|---|
| `src/api/app.ts` | `api.use("/<feature>", <feature>Router);` |
| `src/app/router.tsx` | your routes under the session route |
| `src/app/app-frame.tsx` | turn your `later(...)` nav item into a real link |
| `src/app/quick-actions.ts` | optionally one quick action (see [Quick actions](#quick-actions)) |
| `prisma/schema/household.prisma` / `auth.prisma` | only the back-relation field your model needs (e.g. `shops Shop[]`) |

Need a new primitive (`components/ui`) or shared pattern (`components/shared`)? It must stay
domain-agnostic, gets its own story, and goes in the right layer. If two features need the same pattern,
it belongs in `shared`, not in one of the features.

## 4. Commands (always on the server)

```bash
ssh -i ~/.ssh/wickedhome -o IdentitiesOnly=yes wicked@192.168.1.10
cd /var/www/WickedHome

flock /tmp/wh-prisma.lock npx prisma validate
flock /tmp/wh-prisma.lock npx prisma generate     # after changing your .prisma file
flock /tmp/wh-npm.lock npm install <package>      # only if really needed; prefer what is installed
npx tsc                                           # typecheck
npx eslint src/features/<feature> src/api/<feature> src/routes
```

Don't run `prisma format` while others are working: it rewrites every schema file, not just yours.

The `flock` locks matter when several people (or agents) work at the same time: concurrent
`prisma generate` or `npm install` runs corrupt each other. Database migrations are created by one
person at a time (`npm run db:migrate -- --name <feature>`), never in parallel.

Storybook runs at http://192.168.1.10:6006 and reloads on save.

## Assistant tools

The assistant can do everything a person can do in the app, so every feature gets a **skill**: a folder
`ai/skills/<skill>/` with `tools.ts` (tools that call your service, a resolver so tools take names instead
of ids, optionally search sources and a snapshot line) and `guide.md` (≤ ~400 tokens of documentation for
the model), plus one import line in `ai/skills/index.ts` and a few scenarios in `ai/eval/scenarios.ts`.
Your feature's code never imports `ai/`. The full guide: **[ai/docs/ADDING-TOOLS.md](../ai/docs/ADDING-TOOLS.md)**;
how the assistant works: [ai/README.md](../ai/README.md).

- [ ] **New pages declare `handle.screen`** in their route file (`export const handle = screenHandle<typeof loader>(…)`,
  `@/lib/screen-context`): a detail page its record (`{ kind, id, label }`), an overview page its area
  (`{ kind, label }`); a new kind gets one `registerScreenContext` in the skill's `tools.ts`. Settings-like
  pages declare nothing. See [Screen context](../ai/docs/ASSISTANT.md#screen-context).

## Quick actions

The everyday "add" actions (new task, add shopping item, log an expense, scan product, new event, record
income, ask the assistant) are reachable from every page: a round **"+"** in the phone top bar (a bottom
sheet with big tiles), **"+ Quick action"** at the top of the desktop sidebar (a menu with shortcuts) and
the **command palette** (Ctrl/Cmd + K or "/" for actions and every page; "N" for only the actions, then a
letter: N, T = new task). They all come from one list, `QUICK_ACTIONS` in `src/app/quick-actions.ts`;
the frame passes it to the shared `QuickActionSheet`, `QuickActionMenu` and `CommandPalette`.

To add one for your feature:

1. **Make the target screen open its form from the URL.** Use `useOpenFromUrl(canManage)` from
   `@/lib/open-from-url` for a controlled dialog (`open` / `onOpenChange`), or `useOpenRequestFromUrl`
   for a dialog with its own state (`key={request ?? "idle"} defaultOpen={request !== null}`). Both remove
   the param at once and also work when the screen is already showing. `?new=1` is the default; a second
   form gets its own param (`/expenses?log=1`).
2. **Add an entry** to `QUICK_ACTIONS`: `id`, `labelKey` (`quickActions.items.<id>` in `src/locales/en.json`
   and `nl.json`), a lucide `icon`, the section `accent` it opens, the `to` URL, a free shortcut letter
   `key`, and `roles` when not everyone may create there (mirror your `canManage…` rule, so a child never
   gets a shortcut to a form that won't open).
3. Run `npx tsx --test src/app/quick-actions.test.ts`: it checks unique ids and letters and both
   translations. Keep the list short (it is a grid of tiles on a phone); page-specific actions stay in
   the page header.

An action that opens something already on the page instead of navigating (like "Ask the assistant",
which opens the Ask chat sheet) gets an `onSelect` handler by id in `toQuickActionItems(…)` in
`src/app/app-frame.tsx`.

## Lists and forms

Most lists and forms are the same; only the data differs. Use the shared building blocks by default and
write only the parts that are really about your domain (a row, a tile, a picker).

**Lists: `GeneralList`** (`components/shared/general-list.tsx`). Every list gets the same search field
(debounced, clear button, Esc clears), a **list/tiles switch** that is remembered per list
(`storageKey`, optionally `?view=` with `viewParam`), and the empty, "nothing found for …", loading
(skeleton shaped like rows or tiles), refreshing and error states. You give it the items and how one row
and one tile look:

```tsx
<GeneralList
  label={t("page.title")}
  items={shops}
  getKey={(shop) => shop.id}
  renderRow={(shop) => <ShopListItem shop={shop} … />}   // content only; the list draws dividers + padding
  renderTile={(shop) => <ShopTile shop={shop} … />}      // usually a Card; two per row on phones
  search={{ keys: ["name"] }}                             // or filter(item, q); or query/onSearch/param for server-side
  storageKey="shops"
  defaultView="list"
  toolbar={<ShopTypeFilter … />}                          // filters, sort; `filtered` when one is active
  groupBy={(shop) => shop.type}                           // optional; an item may be in several groups
  pending={useSamePagePending()}
  emptyState={<EmptyState … action={addButton} />}
/>
```

Client-side search ignores case and accents and needs every typed word. For server-side search, pass
`search={{ param: "q" }}` (the query lives in the URL and reruns your loader, which filters) or a
controlled `query` + `onSearch`. The "Add" button stays in the `PageHeader`.

**Forms: `GeneralForm` / `GeneralFormDialog`** (`components/shared/general-form.tsx`,
`general-form-dialog.tsx`). A field config plus your zod schema: the form lays the fields out in a
`FormGrid` (two columns from `sm` up, `span: "half"`), validates with the schema in the browser, posts
through a fetcher with an `intent`, shows `FormResult` field errors under their fields and `formError`
above them, disables everything and spins Save while saving, and calls `onSuccess`. The dialog variant
stays open until saved, can't be closed while saving, closes and toasts (`successMessage`) on success, and
starts fresh on every opening. A "Delete" (or another second action) goes in `secondaryAction`
(`{ label, icon, destructive, confirm: { title, description }, intent, data: { id }, successMessage }`): it sits
apart in the footer, posts its own intent with its own fetcher and busy state, is disabled while the form
saves, and closes the dialog once it succeeded. Don't put such buttons in a `custom` field.

```tsx
<GeneralFormDialog
  trigger={<Button>…</Button>}
  title={t("form.createTitle")}
  schema={habitantInputSchema}            // the schema the action uses for the posted FormData
  intent={isEdit ? "update" : "create"}
  hiddenFields={{ id: habitant?.id }}
  defaultValues={{ name: habitant?.name ?? "", type: habitant?.type ?? "adult" }}
  fields={[
    { name: "name", type: "text", label: t("fields.name") },
    { name: "type", type: "select", label: t("fields.type"), options },
    { name: "birthday", type: "date", label: t("fields.birthday"), span: "half" },
    { name: "shopId", type: "custom", label: t("fields.shop"), render: ({ name }) => <ShopPicker name={name} /> },
    { name: "rotate", type: "switch", label: t("fields.rotate"), when: (values) => values.recurring === true },
  ]}
  successMessage={t("form.created")}
/>
```

Field types: `text` (with `inputType` url/email/tel), `textarea`, `number`, `money` (cents), `date`,
`select`, `switch` (posts `on` when checked), `color` (a palette or the browser picker) and `custom`
(`render` gets `id`, `name`, `value`, `setValue`, `errors`…, so you plug in your own pickers without
`shared` importing features). "(optional)" is detected from the schema. `when(values)` shows a field
only while it applies (hidden fields aren't posted). Group fields under titles with `sections`.
A switch's `on` and other form strings need a form schema with `z.preprocess` (see `shopFormSchema`).
A form whose action redirects to another page (login, setup, invite links) uses `navigate`: it posts with
a normal `<Form replace>`, stays busy until the next page has loaded, and takes its errors from `result`
(or the route's action data); `submittingLabel` and `submitSize="lg"` fit such single-form pages.

**When a bespoke component is justified.** Keep a form or list in your feature when it is more than
fields and rows: conditional or visual editors (the device indicator-rule editor, "if this field has
that value, show this colour"; the floor plan editor), multi-step flows and imports (the energy import,
plan import, waste setup), lists with inline editing, drag and drop or optimistic ticking (the shopping
list), and timelines. Small panels embedded in another page (e.g. a place's tasks) don't need the search
and view switch either. If you build one, still use the shared parts: `SearchField`, `FormField`,
`FormGrid`, `EmptyState`, the skeletons.

## Loading states

Every click gets a visible answer within ~150 ms. Building blocks: `Spinner`, `Progress`, `Skeleton` and
`Button loading` (ui); `LoadingState`, `SkeletonList`, `SkeletonTiles`, `SkeletonBlock`, `SkeletonPage`,
`PendingContent` (shared/loading-state); `useSamePagePending`, `useIsSubmitting` (lib/pending).
`GeneralList` (`loading`, `pending`, `error`) and `GeneralForm` (fieldset + `Button loading`) already
follow the table below.

| Situation | What to do |
|---|---|
| Going to another page | Nothing: the frame shows a top bar and fades the page after 500 ms (`AppShell busy`). |
| A loader with slow parts (aggregates, external APIs, > ~300 ms) | Await only the fast, essential data; return the slow part as an un-awaited promise. In the screen: `<Suspense fallback={<SkeletonTiles />}><Await resolve={data.summary}>…</Await></Suspense>`, with a skeleton shaped like the content. |
| Same page, new search params (period, filter, tab, folder) or revalidation after a submit | `const pending = useSamePagePending()` and wrap the affected content in `<PendingContent pending={pending} label=…>`. |
| `<Form>` submit | Submit button `loading={useIsSubmitting(intent)}`; disable the fields with `<fieldset disabled={busy}>`. |
| Fetcher submit (dialogs, inline edits) | `loading={fetcher.state !== "idle"}`; dialogs stay open until the fetcher is idle and succeeded, then close. |
| Toggles and quick marks (bought, done, favourite, check) | Optimistic UI from `fetcher.formData` instead of a spinner; roll back on error with a toast. |
| Deletes and other confirms | `ConfirmDialog onConfirm={() => fetcher.submit(…)}`: returning the promise keeps the dialog open with a busy button until done. |
| Components that load their own data (`fetcher.load`, pickers, sections) | Skeleton until the first data; afterwards keep showing the old data while refreshing. |
| Long work in the browser (CSV parsing, uploads, batch posts, scanning) | `Progress` with a value and a step text ("Parsing file…", "Saving 3 of 12…"), counts when known, a cancel button when the work can be stopped, and a clear result at the end. |

Rules: no blank or frozen screens; never block the whole page for a part of it; don't show spinners for
loads under ~150 ms (the shared pieces already delay themselves); every loading text is translated (EN + NL);
add a `Loading` story for screens and components with a loading state.

## Phone first (installed home screen app)

WickedHome is installed on phones as a home screen app (manifest + `public/sw.js`, registered by
`src/lib/pwa.ts` in production over HTTPS). Every screen must work there:

- Design for ~375 px wide first; check the `Mobile` viewport in Storybook (add a `Mobile` story to every
  screen and to components with their own layout). Phones are everything below `sm` (640 px).
- **One column on phones.** Cards, tiles, stat tiles and sections stack full width and use the vertical
  space; columns start at `sm` or later. Use `PageGrid`: every variant (`1`, `2`, `3`, `main-sidebar`,
  `cards`, `tiles`, `stats`, `stats-4`) is a single column below `sm`, and so is `GeneralList`'s tiles view.
  Don't write your own `grid-cols-2` for cards or tiles. The one exception is `PageGrid columns="chips"`:
  tiny square chips that are only an icon and a short number or word (hourly forecast, a colour pick) may
  sit two per row. Short pairs of figures inside a card (in / out) and form fields that belong together
  (house number + box) may share a row too; everything else gets its own line.
- **Nothing overflows.** Text never runs out of a button, card or screen:
  - Text buttons in cards, sections, empty states and dialogs get `fullOnMobile` (`<Button fullOnMobile>`):
    full width on phones, at least 40 px tall, the label wraps and the icon stays aligned. Not for icon
    buttons or compact toolbars. `EmptyState` does this for its `action` by itself.
  - Header actions go under the title on phones: `PageHeader` and `SectionHeader` wrap their `actions`;
    `GeneralList` moves its `actions` under the search field when they don't fit; `CardFooter` wraps.
  - Long names, words and amounts wrap (`break-words`); every flex or grid child that holds text gets
    `min-w-0` (`PageGrid`, `CardHeader` and `PageSection` already do). Only `truncate` when the full value
    is reachable elsewhere (a detail page, a tooltip); otherwise let it wrap.
  - No negative margins or absolute positioning that can cut text off at the screen edge.
  - Filter selects in a toolbar are full width on phones (`w-full sm:w-48`) and stack.
- **Sideways scrolling only in a `ScrollRow`** (`@/components/layout/scroll-row`), never the page. It is
  for one row of things: tab bars, segmented controls with many options, filter or legend chips, jump
  links, day and period strips. It snaps to items, hides the scrollbar on touch screens, fades the edge
  that has more, and stays keyboard reachable (its items are focusable, or, with `label` and the default
  `focusable`, the row itself is a tab stop that scrolls with ← →). `wrapFrom="sm" | "md"` scrolls on phones
  only and wraps on bigger screens. `SegmentedControl` is a `ScrollRow` already; `TabsList` scrolls the same
  way. Wide tables and charts scroll in their own `overflow-x-auto` box (see `StackedBarChart`).
  Used today for: the expenses who-pays filter and view switch (`SegmentedControl`), the calendar legend
  chips, shop type chips, shopping list chips, the settings jump links, and the energy tabs, pages and
  periods.
- `AppShell`'s main area has `overflow-x-clip` as a safety net only: fix the cause (a missing `min-w-0`, a
  fixed width, a row that should be a `ScrollRow`) instead of relying on it.
- Touch targets at least 40 px; nothing that only works on hover, right-click or mouse drag. Drag and drop
  always has a tap alternative (e.g. "Place on plan" → tap a spot).
- Inputs keep `text-base` on small screens (iOS zooms into smaller text) and use the right `inputMode` /
  `type` (numbers, email, tel, search) so the phone shows the right keyboard.
- Fixed or sticky elements at the screen edge respect the notch and home bar
  (`env(safe-area-inset-*)`, as `AppShell` does).
- The service worker never caches `/api`: offline, the app shell opens and screens show their normal error
  state with Retry. Don't add caching of household data without discussing it.
