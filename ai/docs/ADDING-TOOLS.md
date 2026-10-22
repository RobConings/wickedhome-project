# How to add assistant tools

Everything the assistant can do lives in `ai/`. A feature never imports `ai/`; its skill in
`ai/skills/<skill>/` imports the feature's API services (`@/api/<feature>/<feature>.service`) and contracts
(`@/features/<feature>/types/...`) and registers itself. Read [ai/README.md](../README.md) first for the flow.

One import gives you everything: `import { … } from "@ai/core/kit"`.

## 1. The skill folder

```
ai/skills/<skill>/
  tools.ts        registerAssistantSkill + tools + resolvers + search sources + snapshot lines
  guide.md        the model's documentation for this area (≤ ~400 tokens, read on every request while active)
  tools.test.ts   optional: rules specific to this skill (the generic checks run for every tool)
```

Add one line to `ai/skills/index.ts`: `import "./<skill>/tools";`. That's the only registration point.

A skill is usually one feature (`tasks`, `expenses`, `places`); a big feature may have two skills when the
areas are used separately (e.g. `places` for rooms and `floorplan` for drawing), a small one may join another.
Keep the number of tools per skill around 3–12: the model gets all of them at once when the skill is active.

## 2. Register the skill

```ts
registerAssistantSkill({
  id: "projects",                                   // = folder name
  title: { en: "Projects", nl: "Projecten" },       // the capabilities list in the app
  summary: "Home projects (renovation, garden): status, budget, linked tasks and purchases.",   // ONE line, English
  keywords: {
    nl: ["project", "verbouwing", "renovatie", "budget", "offerte"],
    en: ["project", "renovation", "budget", "quote"],
  },
  // roles: ["owner", "adult"],                     // only when the whole area is off-limits for children
});
```

- **summary** is in every request (the skill index): one short line, what the area covers, no fluff.
- **keywords** pre-route a question to the skill before the model is called, so most requests need no
  `skills_load` round trip. Matching ignores case and accents and folds plurals ("taak" matches "taken",
  "factuur" matches "facturen"); a keyword of 4+ letters also matches longer words starting with it;
  multi-word phrases match in order. Use words people actually say, in both languages, specific to the area.
  Avoid generic words ("geld", "op", "plan") that would pull the skill into unrelated questions. Add a
  routing case to `ai/core/tools.test.ts` ("routes everyday questions…") for your main phrasing.
- **hints** (optional): words that point to the skill but that other areas use too, like the calendar's
  dates and "wanneer"/"when". They route a question that has nothing stronger, count half, and never make a
  part of a message a question of its own (so "wat is het weer morgen" is a weather question, not an agenda
  one). A message with several questions is routed per part (split at ?, commas, "en"/"and"…).

## 3. Write the guide (guide.md)

Markdown bullets, ≤ ~400 tokens (the test suite fails above ~450). It is the model's documentation for the
area, so write what a smart newcomer must know to use the tools well:

- the concepts and their words (NL and EN where they differ): "a recurring expense has instances…";
- rules the model can't guess: who may do what, what always asks, what is impossible;
- the common flows as "question → tool + key arguments": "'Ik heb 45 euro uitgegeven bij Delhaize' →
  `expenses_log` amount 45, payee Delhaize, category groceries";
- pitfalls: "direct debits are paid automatically", "children only complete their own tasks".

Not in the guide: the tool list or argument docs (the model already gets the schemas), UI instructions,
anything longer than a line.

## 4. Register tools

```ts
registerAssistantTool({
  name: "projects.add_purchase",                    // <skill>.<action>; the model sees projects_add_purchase
  description: "Record a purchase for a project (material, tool, service) with its cost.",   // English, 1–2 lines
  input: z.object({
    project: entityRef("project"),                  // a NAME (or id) → resolved before run (see 5)
    what: z.string().trim().min(1).max(120),
    amount: eurosSchema,                            // euros as the model says them; toCents() for the service
    date: optionalDateSchema("Day of purchase YYYY-MM-DD (default today)"),
  }),
  permission: "sensitive",                          // read | write | sensitive (money, deletes, roles, alarm)
  confirm: "always",                                // never (reads) | first-time | always
  // roles: ["owner", "adult", "child"],            // default: everyone for reads, owners + adults otherwise
  activity: { en: "Recorded a purchase", nl: "Aankoop genoteerd" },
  describe: (ctx, input) => say(ctx.locale,
    `Record ${money(toCents(input.amount))} for “${input.what}” in ${input.project.name}`,
    `${money(toCents(input.amount))} voor “${input.what}” noteren bij ${input.project.name}`),
  run: async (ctx, input) => {
    await recordProjectPurchase(ctx.householdId, input.project.id, { … , amountCents: toCents(input.amount) });
    return done(`Recorded ${money(toCents(input.amount))} for “${input.what}” in ${input.project.name}.`);
  },
});
```

- **Call the feature's service**, never Prisma for writes: the service checks the household, the rules and
  the roles exactly like the UI. Pass `ctx.user` when the service takes a user (it checks children's
  rights). A tool must never be able to do more than the person can in the app.
- **Children and mixed tools**: when children may use a tool for some actions only, add
  `refuse: (ctx, input) => (input.action === "set" && ctx.user.role === "child" ? "Only adults set a count…" : null)`.
  The runner checks it before any card or `run` and gives the model the reason; add the tool's child cases
  to `CHILD_CASES` in ai/core/child-permissions.test.ts (the test fails for a child write without them).
- **Description**: what it does and when to use it, in English, short. Mention the typical question when
  it helps the model pick it ("For 'what do we have to pay this week'").
- **Arguments**: as few as possible, flat, with defaults. `.describe()` only where the name isn't obvious.
  Enums over free text. Dates `YYYY-MM-DD` (`dateSchema`, `optionalDateSchema`), months `monthSchema`, times
  `timeSchema`, money `eurosSchema` (euros, never cents).
- **Naming**: `<skill>.<verb>` or `<skill>.<verb>_<thing>`: `tasks.add`, `tasks.snooze`, `expenses.mark_paid`,
  `places.draw_room`. Lowercase. Names (and enum values) with disarm/unlock/deactivate/open door are refused.
- **core: true** only for the 3–4 reads nearly every conversation needs (today: agenda, open tasks, shopping
  list). Each costs ~100 tokens in every request.
- **available: () => boolean** when a tool depends on a server that may not be set up (the web skill:
  `SEARCH_URL`). An unavailable tool is left out of the model's tools, the skill index, routing and MCP; a skill
  whose tools are all unavailable disappears. Checked on every request, so keep it cheap (read the config).

### Permissions and confirmations

| Change | permission | confirm |
|---|---|---|
| Looking things up | `read` | `never` |
| Harmless, easy to undo (add to list, add task, tick off) | `write` | `first-time` (person may tick "don't ask again") |
| Other changes (events, edits, incomes) | `write` | `always` |
| Money (log, pay, transfers), deletes, accounts/roles, arming the alarm | `sensitive` | `always` |

The registry enforces the combinations. The person confirms on a card in the app (never by voice); the
model is told not to ask "are you sure" itself. Disarming the alarm or unlocking is never a tool. Every
successful write is recorded in the audit log by the runner (set `auditedByService: true` only when your
service already audits every attempt, as the alarm does). MCP clients get writes only with a "read and
change" token and must send `confirm: true` after their human agreed.

### describe and preview (the confirmation card)

`describe(ctx, input)` returns one sentence in the person's language: what will happen, with names, amounts
(`money`) and dates (`day(date, ctx.locale, true)` → "za 04/10/2026"). It gets resolved entities, so use
`input.project.name`.

`preview(ctx, input)` (writes only, optional) returns a picture of the change shown on the card before
Confirm, computed without changing anything:

```ts
preview: async (ctx, input) => ({
  kind: "list",                                       // built in: "list" and "fields"
  title: say(ctx.locale, "3 payments", "3 betalingen"),
  data: { items: rows.map((row) => ({ label: row.payee, detail: money(row.amountCents) ?? "", tone: "add" })) },
}),
```

Built-in kinds: `list` (`{ items: { label, detail?, tone?: "add" | "change" | "remove" }[] }`) and `fields`
(`{ fields: { label, value }[] }`). A feature with a visual change registers its own renderer in the browser,
e.g. the floor-plan diff (`kind: "plan-diff"`, data: the floor id plus added/changed/removed rooms, walls,
doors and windows in cm) drawn as an overlay on the plan:

```ts
// src/app/assistant-previews.ts (composition root; lazy so the chat doesn't load the plan editor)
registerAssistantPreviewRenderer("plan-diff", React.lazy(() => import("@/features/places/…/plan-diff-preview")));
```

Keep preview `data` small (it goes to the browser, not to the model) and validate it in the renderer.
After a reload the preview is recomputed from the stored arguments.

A preview may also refuse: throwing an `HttpError` 4xx (e.g. `badRequest("Bureau would overlap Keuken")`) stops
the call before the card is shown and gives the model the message, so the person is never asked to confirm a
change that would fail. The floor-plan tools (`ai/skills/floorplan`) and `devices.switch` use this.

### Edits and choices on the card (`confirmation`)

Some writes are better decided on the card itself: a mail the person may still change, sent *or* saved as a
draft. `confirmation` (writes only) offers that, generically:

```ts
registerAssistantTool({
  name: "mail.compose",
  input: z.object({ to: …, subject: z.string().max(200), body: z.string().min(1), action: z.enum(["send", "draft"]).optional() }),
  permission: "sensitive",
  confirm: "always",
  confirmation: {
    editable: ["subject", "body"],                     // top-level arguments the person may change on the card
    choices: { field: "action", options: [            // buttons instead of Confirm; the value goes into `action`
      { value: "send", label: { en: "Send", nl: "Versturen" } },
      { value: "draft", label: { en: "Save as draft", nl: "Als concept bewaren" } },
    ] },
  },
  preview: (ctx, input) => ({ kind: "mail", data: { … } }),   // its renderer shows inputs for the editable fields
  …
});
```

- The card shows an **Edit** button when there are editable fields and a preview; while editing, the preview
  renderer gets `edit = { editing, editable, values, onChange }` and draws inputs for the fields it knows
  (`AssistantPreviewRendererProps.edit`). Choice buttons replace Confirm (the first is the primary one).
- The browser sends `{ decision: "confirm", edits?: { field: value }, choice?: value }` to
  `POST …/confirmations/:id`. The server (`amendedArguments` in core/assistant-loop.ts) accepts only the
  `editable` fields and the listed choice values, merges them into the stored arguments, **validates them again
  with the tool's zod schema** (names resolved again) and **runs the preview again** (a preview may still
  refuse). Anything invalid answers 400 before streaming; nothing runs and the card stays.
- What runs is stored as the call's arguments (with a new summary from `describe`) and that is what the audit
  log records. When the person changed fields, the model's result says so (`changedByPerson: [...]`).
- Without edits or a choice, Confirm runs the model's own arguments: tools without `confirmation` and clients
  that don't send the new fields work exactly as before. The registry refuses `confirmation` on reads and
  fields that aren't arguments.

### Results: compact, always

What `run` returns is read by a small local model with a ~16k context. Use the helpers:

- `capList(items, 20, map)` → `{ items, more: 37 }`; never return unbounded lists.
- `money(cents)` → "€ 1.234,56"; `day(date, locale)` → "04/10/2026" in text; dates in data as `YYYY-MM-DD`.
- `done("Added “Dakgoot kuisen” for Clara, due 11/10/2026.", { id })` for writes: one sentence + the id.
- Only fields a follow-up needs; ids only where the model may act on the item next; `null`/`undefined` are
  dropped automatically, so `field: value || null` is a cheap way to omit defaults.
- Prefer short strings to nested objects when the model only reads them (`"14:00 18° rain 20%"`).
- Results are cut at 4000 characters (600 for earlier turns).

### Large arguments (geometry, batches)

Tools may take structured input such as plan geometry. Keep it compact for the model:

- points as number pairs in cm: `z.array(z.tuple([z.number(), z.number()])).min(3).max(64)`, not objects;
- prefer relative, human-shaped input the model can produce reliably: `{ name: "Slaapkamer", widthCm: 400,
  depthCm: 300, relativeTo: entityRef("place"), side: z.enum(["north", "east", "south", "west"]) }`, and
  compute the exact polygon in the tool;
- cap list sizes (`.max(…)`) and return a short summary (`done("Drew Slaapkamer 4 × 3 m north of Keuken")`),
  never the geometry back.

The loop keeps the arguments of the current turn and replaces long arguments of earlier turns by a short
placeholder, so a big drawing doesn't stay in the context.

## 5. Names instead of ids: entity resolvers

Arguments that name a thing use `entityRef(type)`: the model sends "Clara", "de keuken", "Fluvius",
"gezamenlijke rekening"; your `run` receives `{ type, id, name, hint?, data? }`. Ambiguous or unknown names
never reach your tool: the model gets "Which person do you mean by "Jan": "Jan Peeters (adult)" or "Jan De
Smet (child)"?" and asks. `z.array(entityRef("habitant")).max(10)` and `.optional()` work.

Register the resolver of your entity type once (add the type to `ENTITY_TYPES` in `ai/core/resolve.ts`):

```ts
registerEntityResolver({
  type: "project",
  label: "project",                                 // English noun for the messages
  skill: "projects",
  list: async (ctx) => (await listProjects(ctx.householdId)).projects.map((project) => ({
    id: project.id, name: project.name, aliases: [], hint: project.status,
  })),
});
```

- `list` for small sets (cached 30 s per person, dropped after every write); `search(ctx, query)` for big
  sets (return a few dozen candidates; the matcher ranks them).
- `aliases` for other names people use; `hint` to tell same-named things apart; `date` (YYYY-MM-DD) for
  dated things so "Vuilnis buiten 2026-10-07" picks the right one; `self: true` on the habitant of the person
  asking ("ik", "me").
- `roles` when some people may not see the type at all.
- Already registered: `habitant` (household), `place`, `floor` (places), `shop`, `shopping_list`,
  `shopping_item`, `staple` (shopping), `product` (inventory), `task` (tasks), `event` (calendar), `account`,
  `recurring_expense`, `expense` (expenses; a payee names its next unpaid bill, a date picks another),
  `income_source` (income), `project` (projects), `automation` (automations), `notification_kind` (settings),
  `mail_suggestion` (integrations), `contact` (contacts; `data`: `email`, `emails`, `phone`, `phones`, `company`, `trade`).
- App texts: `appText("<namespace>:<key>", ctx.locale)` reads the app's own translations (job and notification
  titles), so a skill never copies UI text.
- `entityNames(ctx, "habitant")` gives an id → name map for results ("who": names, not ids).

## 6. Search sources and the snapshot

Every resolver feeds `search_everything` automatically (`searchable: false` to opt out). For full-text or
content search add a source:

```ts
registerSearchSource({ id: "documents", type: "document", skill: "documents",
  search: async (ctx, query, limit) => (await searchDocuments(ctx.user, query, limit)).map((doc) => ({
    id: doc.id, title: doc.name, hint: doc.folderName, score: 70 })) });
```

The household snapshot in the system prompt has one line per area that the model needs on nearly every
request (people, rooms, accounts). Add one only if it's that essential, ≤ ~60 tokens:

```ts
registerAssistantContext({ id: "vehicles", order: 40, build: async (ctx) => `Cars: ${…}.` });
```

## 6b. Screen context

Pages your feature adds declare what they show (`handle.screen` in the route file, see
[ASSISTANT.md](ASSISTANT.md#screen-context)). Register each kind once in your `tools.ts`: the skills it
activates and a household-scoped `describe` (label + one short English summary; null for a foreign id):

```ts
registerScreenContext({ kind: "vehicle", skills: ["vehicles"],
  describe: async (ctx, id) => { const car = id ? await getVehicle(ctx.householdId, id) : null;
    return car && { label: car.name, summary: `car "${car.name}" (${car.plate})` }; } });
```

A tool whose target may be "this" can default it: `input.vehicle?.id ?? screenTarget(ctx, "vehicle")`.

## 7. Eval scenarios and tests

- Add one or two scenarios per tool to `ai/eval/scenarios.ts` (NL and EN): the question, the expected
  skill, tool and key arguments, or `refuse: true` for things it must not do. Seed what they need in
  `ai/eval/seed.ts`.
- `npm run assistant:eval -- --routing` checks keyword routing in seconds (no model); the full run needs
  the LM Studio model (see ai/README.md).
- The generic tests (`ai/core/tools.test.ts`) check every tool: valid schema, a registered skill, guide
  size, confirmation rules, no disarm. Add a `tools.test.ts` in your skill folder for skill-specific rules.
- Run on the server: `npx tsc --noEmit -p .`, `npx eslint ai src/api/<feature>`, `npm test`.

## Checklist

- [ ] `ai/skills/<skill>/tools.ts` + `guide.md`, one line in `ai/skills/index.ts`
- [ ] Skill summary one line; keywords NL + EN, specific
- [ ] Tools call services; permissions and confirmations per the table; `describe` in both languages
- [ ] Names via `entityRef`; resolver registered for new entity types
- [ ] Results compact (`capList`, `money`, `day`, `done`)
- [ ] New pages' screen kinds registered (`registerScreenContext`)
- [ ] Scenarios in `ai/eval/scenarios.ts`; tests and lint pass
