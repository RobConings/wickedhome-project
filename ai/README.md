# ai/ — the WickedHome assistant

Everything that makes the assistant work is in this folder: the core (how a question becomes tool calls),
the skills (what it knows and can do, one folder per area of the app), the eval and the docs. The chat UI is
the only part elsewhere: [`src/features/assistant`](../src/features/assistant).

The assistant runs on a **local model** (LM Studio on a PC in the house, OpenAI-compatible API; the target is
a Qwen-class model with ~16k context on a 20–24 GB GPU). The conversation never leaves the house; only the web
skill sends search words to the household's own SearXNG and fetches public pages (docs/WEB-SEARCH.md). It can do what the
person can do in the app, through the same service functions as the UI, with the same roles, and every
change is confirmed by the person and recorded in the audit log.

```
ai/
  README.md            this file
  core/                the engine (no feature knowledge)
  skills/<skill>/      tools.ts + guide.md (+ tests) per area: tasks, calendar, expenses, places…
  skills/index.ts      the one place that imports every skill (src/api/app.ts imports it once)
  eval/                scenarios, seed data and the runner (npm run assistant:eval)
  docs/                ASSISTANT.md (setup, chat, MCP, API), MCP-OAUTH.md (ChatGPT/Claude connectors), ADDING-TOOLS.md (how to add tools), WEB-SEARCH.md (SearXNG, SSRF rules)
```

## How a question flows

1. **The question arrives** (`POST /api/assistant/conversations[/:id/messages]`, `core/assistant.routes.ts`)
   and is stored (`core/assistant.service.ts`).
2. **Routing** (`core/routing.ts`, `core/skills.ts`): the question is matched against every skill's
   keywords (Dutch and English, accents and plurals ignored; when no keyword matches, names of known things
   such as "Fluvius" or "Delhaize" point to their skill). A message with several questions is routed per
   part (split at "?", commas, "en"/"and"…): "wat is de volgende betaling en wat is het weer morgen" activates
   expenses *and* weather. Words every area uses (dates, "wanneer") are calendar **hints**: half weight, never
   a question of their own. The question's skills (plus the best one or two of the whole message) become
   **active** for this conversation, together with skills used earlier (at most 3; skills of earlier turns
   drop out first, least recently used first; a skill the current question asked for never drops).
   Most questions therefore need no extra round trip to find the right tools.
3. **The prompt** (`core/assistant-prompt.ts`, `core/context.ts`) is small and stable:
   - short rules (language, brevity, confirmations are the app's job, never claim success without a result,
     disarming is impossible);
   - the **skill index**: one line per area, so the model knows everything that exists;
   - the **household snapshot**: people, rooms per floor, accounts, today and the next 7 days with weekdays
     (cached 5 minutes, dropped after a write);
   - the **guides** of the active skills (≤ ~400 tokens each).
   The clock time and the language to answer in (Dutch or English, from the question's own words; local
   models otherwise drift to Dutch because the household data is Dutch) go with the question, not in the
   system prompt, so the model server can reuse its prompt cache.
4. **Tools sent**: only the always-on core tools (`skills_load`, `search_everything`, `app_context`,
   `app_help` and the most common reads) plus the tools of the active skills — about 10–20 instead of
   100+. If the model needs another area it calls `skills_load`, and that skill's tools are there in its
   next step (same turn).
5. **The loop** (`core/assistant-loop.ts`): up to 8 model calls per question; it stops as soon as the model
   answers in text. For each tool call:
   - arguments are validated (zod) and **names are resolved** (`core/resolve.ts`): "Clara", "ik", "de
     keuken", "Fluvius" become ids; an ambiguous name goes back to the model as "which one: A or B?";
   - **reads** run at once;
   - **writes** pause for a **confirmation card** in the app (what will happen, optionally a preview such as
     a plan diff or a list), then run after Confirm. A tool may let the person edit some arguments on the
     card and/or offer choice buttons instead of Confirm (a mail: Send / Save as draft); the amended arguments
     are validated, previewed and audited again (`confirmation`, docs/ADDING-TOOLS.md). Harmless writes offer "don't ask again"; money,
     deletes, roles and arming the alarm always ask. Voice never confirms.
   - several calls in one answer run in the model's order: reads at once, writes wait for their cards (one
     after the other), and the model continues once every card is answered;
   - the person's role is checked first, for the tool and its arguments (`roles`, `refuse`: a child may use
     up stock but not set a count): a refused call gets no card and never runs; the model relays the reason;
   - the exact same call twice in one turn is not run again: the model is told to use the earlier result,
     that tool is no longer offered this turn, and after two repeats (as on the last step) it must answer in
     text (tool_choice none plus a note);
   - an answer without any text (e.g. tool-call markup on the last step, which is filtered out), even after
     asking once more, becomes a short fallback answer ("Ik kon dit niet afronden …", logged) instead of silence.

   **Several questions, one message**: the prompt asks the model to handle every part, and the loop checks
   it (`missedParts` in `core/routing.ts`): when the model answers in text but called no tool for a part of
   the question that routed to a skill (the message has 2+ such parts, at least one was handled, and the
   answer doesn't talk about the skipped one), it gets one short note ("You haven't answered the part about
   Weather yet…") and answers again, once per turn, within the step limit. Only the combined answer is
   stored and shown: while such a follow-up is still possible the step's text is held back (sent in one
   piece when it is final), and a skipped answer is dropped. Other answers stream as usual.
6. **Results** are compact (`core/compact.ts`): short JSON, money as "€ 1.234,56", lists capped with "and N
   more"; older turns are cut harder and oldest turns are dropped to fit the history budget
   (`core/tokens.ts`).
7. **Audit**: every successful write (chat or MCP) is recorded in the household audit log
   (`core/tool-audit.ts`), with the person and the confirmation text.

Other assistants on the LAN (Claude Desktop, LM Studio's MCP client) get the same tools over **MCP**
(`POST /api/mcp`, `core/mcp.routes.ts`): read-only tokens by default, writes need `confirm: true`.

## The core, file by file

| File | What |
|---|---|
| `core/tools.ts` | The tool registry and its safety rules (read never asks, sensitive always asks, no disarm). |
| `core/skills.ts` | The skill registry (summary, keywords, guide) and keyword routing. |
| `core/routing.ts` | Which skills are active in a conversation → which tools and guides go into a request. |
| `core/resolve.ts` | Entity resolvers and `entityRef(type)`: names instead of ids, fuzzy, with "which one?" messages. |
| `core/search.ts` | `search_everything` over every resolver and registered search source. |
| `core/context.ts` | The household snapshot (lines registered by skills) and the date lines. |
| `core/compact.ts` | Helpers for compact results: `money`, `day`, `capList`, `done`, `prune`. |
| `core/tool-helpers.ts` | Argument helpers: `eurosSchema`, `dateSchema`, `monthSchema`, `timeSchema`, `say`. |
| `core/kit.ts` | Everything a skill needs, in one import (`@ai/core/kit`). |
| `core/core-tools.ts` | The always-on tools: `skills_load`, `search_everything`, `app_context`, `app_help`. |
| `core/app-map.ts`, `core/app-notes.md` | "Understand the app", lazily for `app_help topic`: the page map (NL/EN names → path) read at runtime from the navigation (`src/app/app-frame.tsx`), the Settings sections and the router, labelled with the app's own translations; short "how it works" notes per area; `appText(i18nKey)` for skills (job and notification titles). Never in the system prompt. |
| `core/assistant-prompt.ts` | The system prompt. |
| `core/assistant-loop.ts` | The tool-call loop, confirmations, history compaction and budget. |
| `core/llm-client.ts` | The OpenAI-compatible streaming client (LM Studio, llama.cpp, vLLM), reasoning switches and filtering. |
| `core/tokens.ts` | Token estimates, the prompt budget and the per-request measurement. |
| `core/assistant.service.ts` | Conversations, wiring the loop to the database, status, MCP tokens. |
| `core/assistant.routes.ts`, `core/mcp.routes.ts` | HTTP: the streamed chat and MCP. |
| `core/mcp-oauth.ts`, `core/mcp-oauth.store.ts`, `core/mcp-oauth.routes.ts`, `core/mcp-oauth.jobs.ts` | OAuth 2.1 for the MCP server (ChatGPT/Claude connectors): discovery, DCR, consent, tokens, cleanup ([docs/MCP-OAUTH.md](docs/MCP-OAUTH.md)). |
| `core/assistant-config.ts`, `core/assistant-stt.ts`, `core/assistant.jobs.ts` | Settings, speech to text, cleanup job. |
| `core/assistant-tts.ts`, `core/assistant-tts.routes.ts` | Reading answers aloud in a natural voice: Piper (or an OpenAI-compatible speech server), `POST /api/assistant/speech`, `GET /api/assistant/voices` (docs/ASSISTANT.md "Speech output"). |

**Dependency rules** (lint-enforced): `ai/` may import the features' API services (`@/api/<feature>/…`)
and contracts (`@/features/<feature>/types/…`); features never import `ai/`; only `src/api/app.ts` (routes,
skills) references it. The core knows no skill: skills register themselves (tools, resolvers, search
sources, snapshot lines) from `ai/skills/<skill>/tools.ts`.

## Adding a skill or a tool

See [docs/ADDING-TOOLS.md](docs/ADDING-TOOLS.md). In short: a folder `ai/skills/<skill>/` with `tools.ts`
(`registerAssistantSkill`, `registerAssistantTool`, `registerEntityResolver`…) and `guide.md`, one import
line in `ai/skills/index.ts`, scenarios in `ai/eval/scenarios.ts`.

## Speed and context: the numbers

A typical question ("Wat moet ik vandaag nog doen?") with the tasks skill pre-routed:

Measured with `npm run assistant:eval -- --routing` (estimates, 2026-10-04, 24 tools registered):

| | Before (all tools every time) | Now |
|---|---|---|
| System prompt | ~330 tokens, no household knowledge, no area guides | ~1 170 (rules, index of 13 skills, dates, guides of tasks + calendar) + ~100–200 snapshot |
| Tool definitions | all tools: ~3 400 tokens for 24 tools, ~14 000 at ~100 tools | 10 tools ~1 570 (core + active skills), about the same at 100+ tools |
| History | up to 40 messages, results up to 6 000 chars each | budget ~5 000 tokens; older results cut to 600 chars |

With ~100 tools a request stays around 3–4k tokens before history instead of ~15k, and the model also
knows the household and the area's rules without an extra tool call.

Measure it yourself: in development every model call logs a line like
`[assistant] step 1: ~2410 tokens = system 820 + tools 1290 (9) + history 300 (server: 2388 in, 41 out), skills [tasks], 1830 ms`
(set `ASSISTANT_LOG_TOKENS=1` to log in production too). The eval prints the averages.

Reasoning ("thinking") is off by default (`ASSISTANT_THINKING=on` to enable): a local model answers several
times faster without it. The request carries both switches, `chat_template_kwargs.enable_thinking=false`
(llama.cpp, vLLM, Qwen 3 templates) and `reasoning_effort: "none"` (LM Studio; the only one Gemma 4 honours
there); `/no_think` goes into the system prompt only for Qwen models. Reasoning streamed inside the text
(`<think>`, `<thought>`, Gemma-style `<|channel>thought…<channel|>`) is hidden either way; LM Studio sends
it separately (`reasoning_content`), which is ignored.

When a turn fails (model unreachable, HTTP error, timeout, stopped) the server logs one line
`[assistant] turn failed { conversationId, step, model, error }` (never the question or tool results), and a
tool call with invalid JSON logs `[assistant] invalid tool call`. The chat shows the error with **Try again**;
a stream that stops without its final event (server restart, lost connection) shows "The answer was
interrupted".

## The eval

```bash
npm run assistant:eval -- --routing          # keyword routing only: no model, no database
npm run assistant:eval                       # everything, against ASSISTANT_BASE_URL / ASSISTANT_MODEL
npm run assistant:eval -- --only=tasks,exp --verbose
```

~220 questions in Dutch and English (`eval/scenarios.ts`), including messages with two or three questions
(`tools: [...]`: every part's tool must be called), each in a fresh conversation against a seeded
household (`eval/seed.ts`) on a throwaway database (created, migrated, dropped). Writes stop at the
confirmation, so nothing is changed. It reports pre-routing accuracy, tool choice, argument accuracy,
refusals (disarming, children and money), average latency and prompt tokens. Run it on the server (it needs
`DATABASE_URL` with a role that may create databases).

Unit tests (no model, no database): `ai/core/*.test.ts` (registry rules, routing, resolvers, skill loading,
token budget, the loop with a fake model, LLM client, MCP) and `ai/skills/*/tools.test.ts`.
`ai/eval/fake-openai-server.ts` is a keyword-driven fake LM Studio for development, and
`ai/eval/assistant-runtime-check.ts` runs the whole app end to end against it.

## Skills overview

One row per skill (`ai/skills/<skill>/`; `app` is the core's own, always on). Tool counts as of 2026-10-04; other
agents may add lines, keep one row per skill.

| Skill | What it covers | Tools |
|---|---|---|
| `app` (core) | What the assistant can do, `app_help topic` (where is it in the app, how does it work: page map and notes read from the code), search everything, fresh snapshot | 4 |
| `alarm` | The house alarm: status, arming home/away (never disarming) | 3 |
| `automations` | Scheduled jobs (Settings › Automations): schedule, last run and outcome, run now, pause/resume | 3 |
| `calendar` | Household agenda: events, birthdays, other areas' dates, Google; add, change, delete | 4 |
| `contacts` | Contacts (contractor, plumber, supplier, bank, school): find by name, company or trade (NL/EN), phone and email, project roles; add, edit, link to a project, delete | 4 |
| `devices` | Devices and sensors with live state; lights, switches, blinds, thermostats, scenes | 10 |
| `documents` | Documents and folders: find, what is attached where, organise, attach | 8 |
| `energy` | Electricity and gas use, solar, peak, meter readings, imports, appliances | 9 |
| `expenses` | Bills and recurring payments: due, history, payment details, add, edit, mark paid, log spending | 9 |
| `floorplan` | Drawing floor plans: rooms, walls, doors, windows, north | 7 |
| `household` | Members (add, change, remove, birthdays) and logins (accounts list; invite link, revoke, role, block: owners only) | 7 |
| `income` | Incomes per person or joint: received vs expected, record, recurring | 7 |
| `integrations` | Google, Home Assistant and assistant status; sync own calendar/mail; own calendars; bills from mail (list, accept, link, dismiss, sender rules); bill documents to Drive | 9 |
| `mail` | Your own Gmail: search, read/summarise, save attachments to documents, write mails (card: Send / Save as draft / Edit), link threads to projects; chat only, not for children, mail content treated as untrusted data | 5 |
| `inventory` | Stock and products: low, expiring, where, use/add, minimums, barcodes | 7 |
| `money` | Joint and savings accounts, contributions, corrections, loans, timeline | 10 |
| `places` | Floors, rooms and zones: sizes, contents, add, rename, move, delete | 8 |
| `projects` | Budget projects: status, linked expenses and materials, costs, create and edit | 6 |
| `recipes` | Recipes from a link (schema.org data), pasted text or a photo: match ingredients to products (shared stock), save, plan (To cook + missing items on the list); unknown ingredients searched only on the webshops switched on for ingredient search; cooking: what was used, extras, steps, done (children too) | 10 |
| `settings` | Household name and address (geocoded), weather source, language, activity log, own notifications and preferences | 9 |
| `shopping` | Shopping lists: items per shop/list, add, tick off, move, remove; staples | 6 |
| `shops` | Shops: favourites, address, hours, websites; add, edit, delete | 4 |
| `tasks` | To-dos and chores: open/overdue/done, add, edit, complete, hold, dependencies, comments, checklists | 10 |
| `waste` | Waste collection days | 2 |
| `weather` | Weather now, next hours and days | 1 |
| `web` | Search the internet (self-hosted SearXNG) and read pages: products and materials with price, shop and link, recipes (ingredients, steps); results untrusted, pages behind an SSRF guard; offered only with `SEARCH_URL` ([docs/WEB-SEARCH.md](docs/WEB-SEARCH.md)) | 2 |

Never a tool, in any skill: passwords, sessions, password-reset links, logging in as someone else, tokens, keys or
other secrets (`.env`, OAuth tokens, VAPID, `INTEGRATIONS_KEY`, the assistant's API key), connecting or
disconnecting Google (needs the consent screen), deleting the household, disarming the alarm or unlocking.
