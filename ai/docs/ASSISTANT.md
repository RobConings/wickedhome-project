# Assistant

Status: built (2026-10-03), core rebuilt for a local model with skills and dynamic tools (2026-10-04).
Waiting for the owner's LM Studio address and model; until then `/assistant` and its card on
`/integrations` show **not configured** with the setup steps. The app works fully without it.

How it works, file by file: [ai/README.md](../README.md). How to add tools: [ADDING-TOOLS.md](ADDING-TOOLS.md).

The assistant is a local model (LM Studio on a PC in the house, OpenAI-compatible API) that answers
questions about the household and does things **with the same actions as the UI**: every tool calls the
same service function as the feature's API route, with the same household scoping and role checks. Other
assistants on the LAN get the same tools over **MCP**.

Code: `ai/core` (registry, skills, routing, resolvers, LLM client, loop, service, routes, MCP),
`ai/skills/<skill>/` (tools + guide per area), `ai/eval` (scenarios, runner, fake model),
`src/features/assistant` (chat UI, card, voice, confirmation previews). Data: `prisma/schema/assistant.prisma`.

## Owner's setup

1. On the PC with the GPU: install **LM Studio** and download a model **with tool support**. Target: a
   Qwen-class dense model of ~27B (Q4_K_M) on a 20–24 GB GPU; smaller (Qwen 3 8B / 14B) works with less
   memory, a bit less reliably on multi-step requests. **Gemma 4 26B A4B** (`google/gemma-4-26b-a4b-qat`,
   in use since 2026-10-04) works too: tool calls (several per answer), usage counts, and reasoning sent
   apart from the answer. LM Studio ignores `enable_thinking` for it; `reasoning_effort: "none"` (sent by the
   app when thinking is off) is what switches its reasoning off.
2. LM Studio → **Developer** → load the model → **Settings**: context length **16k** (the assistant keeps
   every request under ~11k tokens), switch on **Serve on Local Network**, start the server (port 1234).
   Give the PC a fixed address in the router (DHCP reservation). Keep "Flash attention" on if offered.
3. On the server, in `/var/www/WickedHome/.env`:
   ```
   ASSISTANT_BASE_URL=http://<pc-ip>:1234/v1
   ASSISTANT_MODEL=<model identifier exactly as LM Studio shows it>
   # ASSISTANT_API_KEY=           only if the server asks for a token (LM Studio: "require API token");
   # ASSISTANT_TOKEN=             the same setting under another name; sent as Authorization: Bearer …
   # ASSISTANT_THINKING=on        let the model reason first (slower; default off)
   # ASSISTANT_VISION=off         no images in questions (for a text-only model; default on)
   # ASSISTANT_LOG_TOKENS=1       log prompt sizes per model call in production too
   # ASSISTANT_TIMEOUT_FIRST_BYTE=300   seconds until the answer starts, prompt reading included (default 300)
   # ASSISTANT_TIMEOUT_IDLE=60          seconds of silence mid-answer (default 60)
   # ASSISTANT_TIMEOUT_TOTAL=           seconds for a whole model call (default: no limit)
   # ASSISTANT_PARALLEL=1               model calls at once; keep equal to LM Studio "Max Concurrent Predictions"
   #                                    (others queue in the app, chats before the mail scan: ai/core/model-queue.ts)
   # ASSISTANT_STT_URL=http://<pc-ip>:8000/v1   optional local Whisper (OpenAI-compatible /audio/transcriptions)
   # ASSISTANT_STT_MODEL=whisper-1              model name for that server (default whisper-1)
   # ASSISTANT_TTS_URL=http://127.0.0.1:5005    optional natural voice for reading aloud (Piper, see "Speech output")
   ```
4. `pm2 restart wickedhome`. Open **Integrations → Assistant → Test connection**: it lists the server's
   models and times a one-token answer. The first answer after LM Studio starts can take a while (loading).
5. Optional: `npm run assistant:eval` on the server measures how well this model does (see ai/README.md).

The server reaches LM Studio over the LAN only; nothing goes to the internet.

## Skills and tools

A **skill** is an area of the app (tasks, calendar, shopping, expenses, income, energy, waste, weather,
inventory, recipes, alarm, household, places, and more as features add theirs). Each has a one-line summary (always
in the prompt), keywords in Dutch and English (routing), a short guide (in the prompt while active) and
tools. Per request the model gets:

- the **core tools**, always: `skills_load`, `search_everything`, `app_context`, `app_help`, plus the most
  common reads (`calendar_agenda`, `tasks_list_open`, `shopping_list`);
- the tools of the **active skills** (at most 3): the skills the question's keywords point to, skills used
  earlier in the conversation, and skills the model loaded with `skills_load`.

Tools take **names** for people, rooms, floors, shops, tasks, events, accounts and recurring payments
("Clara", "ik", "keuken", "Fluvius", "gezamenlijke rekening"); the app resolves them and asks back when a
name is ambiguous. Results are short and consistent (money "€ 1.234,56", dates dd/mm/yyyy in text).

**Rules the registry enforces**: read tools never ask; write tools ask (`first-time` or `always`);
sensitive tools (money, deletes, roles, arming the alarm) always ask; `alarm.*` actions must be sensitive;
any name (or argument enum) with *disarm / unlock / deactivate / open door* is refused, so disarming the
alarm can never become a tool. Writes default to owners and adults; children get only what the app allows
them (adding to the shopping list, completing their own tasks).

The full, current list of skills and tools with their permission is on the **Assistant card** (Integrations
or the assistant's settings sheet → "What it can do"), and the assistant answers "what can you do" from the
same registry (`app_help`).

## Chat

`/assistant` (and `/assistant/:id`): conversation list (sidebar; a sheet on phones), the chat, and a settings
sheet with the card. The **Ask** button (bottom right on every page) opens a quick chat in a sheet.

- **Streaming**: `POST /api/assistant/conversations` (new) or `…/:id/messages` answers with
  `text/event-stream`, one `data: <json>` event per line: `start`, `text`, `message`, `tool` (running / done /
  failed / cancelled, with the activity label), `confirm` (with an optional `preview`), `notice` (`no_tools`,
  `max_steps`), `error`, `done`. Stop aborts the request and the model call. One answer at a time per
  conversation.
- **The loop** (`ai/core/assistant-loop.ts`): up to 8 model calls per question, stopping as soon as the model
  answers in text; tools run in order; a write that needs a confirmation is stored as a pending tool message
  and the turn pauses (`done: paused`). The last allowed step goes without tools so the model must answer.
  A message with several questions activates every part's skill; if the model skips a part, the loop asks
  it once more and only the combined answer is shown (ai/README.md, "Several questions, one message").
- **Confirmation cards**: what will happen (the tool's `describe`, in the person's language), an optional
  **preview** of the change (a list, label/value fields, or a feature's own renderer such as a floor-plan
  diff), Confirm / Cancel, and "Don't ask again" for `first-time` tools only (per user per tool; reset with
  "Ask again for everything" on the card). `POST …/confirmations/:messageId {decision, remember}` runs or
  cancels and streams the rest. A cancelled call tells the model "nothing was changed". Asking something
  else while a card waits answers it as "not confirmed". A confirmation works once.
- **System prompt** (`ai/core/assistant-prompt.ts`): short rules (answer in the person's language, be brief,
  call independent tools in one step, answer every part of a message in the order asked, names not ids, confirmations are the app's job, never claim success without a tool
  result, disarming is impossible), the skill index, the household snapshot (people, rooms per floor,
  accounts, today and the next 7 days), and the guides of the active skills. The clock time and the language
  to answer in (from the question's words) are added to the question so the system prompt stays cacheable.
- **Context budget**: ~2.6k tokens system, ~3k tools, ~5k history (oldest turns dropped, earlier results and
  long arguments cut). Every model call logs its size in development.
- **Models without tool support**: when the server refuses `tools`, the loop retries without them and the chat
  shows a notice. **Reasoning** is off by default (`enable_thinking=false` and `reasoning_effort: "none"`;
  `/no_think` for Qwen only) and hidden from the chat when a model sends it.
- **Errors** are shown in the thread in plain words, with **Try again**: unreachable PC, timeout (300 s until the
  first streamed chunk, prompt reading included; 60 s of silence; no total limit; all three set in `.env`,
  see step 3; the log names the limit that fired), server refusals, a lost connection, an answer cut off (the
  stream ended without `done`, e.g. a server restart). The server logs one line per failed turn:
  `[assistant] turn failed { conversationId, step, model, error }` (never the question or results).

## Answers outlive the page

An answer runs on the server, not on the browser connection (`ai/core/assistant-runs.ts`): leaving the page,
a phone locking or a dropped connection only stops *watching*; the model finishes and everything is stored.
The request that asked only watches the run, like a later `GET …/stream`, which replays every event so far
and then the rest live. A conversation opened mid-answer (`running` in its detail, whose messages leave out
what the run stored so far) attaches that way, and a chat whose stream is cut off attaches again by itself
(up to 3 tries, once the page is visible). Only Stop (`POST …/stop`) ends an answer early. One run per
conversation is also the lock against two windows interleaving a turn. Runs live in the server's memory: a
restart ends them (what was stored stays).

## Images

The chat's image button (or paste / drop) attaches up to 4 images to a question, e.g. one floor cropped from
an architect's plan. The browser resizes each to at most 2048 px on the longest side, **on a white
background** (vision models see transparent pixels as black) as JPEG, and uploads it at once
(`POST /images`, JPEG/PNG/WebP checked by their first bytes, ≤ 6 MB); the question sends the ids. The
images are stored with the question (`AssistantImage`, deleted with the conversation; uploads never sent
are removed by `assistant.cleanup` after a day).

The model gets them as OpenAI `image_url` parts (`data:` URLs), so the model must support images (Gemma 4,
Qwen-VL…; `ASSISTANT_VISION=off` hides the button otherwise). Only the **latest** question with images
sends them, and only while it is one of the last 3 questions, so follow-ups ("make those rooms") still see the
plan; older images become a one-line note (a local vision model re-reads the image on every call, and long
conversations with a plan timed out).
An image counts as ~600 tokens in the prompt budget (Gemma 4 in LM Studio: ~500 for 2048 px). Small
text on a whole plan sheet is unreadable at that size: send one floor per image.

A photo of a recipe (a cookbook page, a handwritten card) is read the same way: the model reads the name,
servings, ingredients and steps itself and calls `recipes_match` and `recipes_save`; no tool makes a model
call of its own. Routing goes by the question's words, so a photo with no text routes nowhere: add a word
like "recept" / "recipe" (see Known gaps).

Invoices are the exception: `projects_link_invoice` ("koppel de factuur van Toppy aan het materiaal") and the
project page's "Read invoice with AI" make a model call of their own through
`ai/skills/projects/invoice-reader.ts` (registered into `src/api/projects/invoice-readers.ts`, like the mail
scan's bill reader): the expense's attached PDF text, or its photo when `ASSISTANT_VISION` is on, plus the
project's materials, at chat priority with a 90 s limit. The card's preview reads once (kept 10 minutes) and
Confirm applies that reading. Details: docs/PROJECTS.md.

## Screen context

The Ask sheet takes the page it was opened from along, so "add this to the list" on a product's page or "mark
this done" on a task's page just works. The composer shows the page as a chip (pin + label, e.g.
"Spaghetti") above the field: on by default, one tap leaves it out (that choice stays for the chat until the
page changes); the question in the thread keeps the chip. No context, no chip.

- **Pages declare it** in their thin route file, through the React Router `handle` (never inside a feature):

  ```ts
  // src/routes/task-detail.tsx: a detail page (kind = the record's entity type)
  export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "task", id: data.detail.task.id, label: data.detail.task.title }));
  // src/routes/tasks.tsx: an overview page, only the area
  export const handle = screenHandle(({ t }) => ({ kind: "tasks", label: t("nav.tasks") }));
  ```

  `screenHandle` and `useScreenContext` are in `src/lib/screen-context.ts`; the type `ScreenContext
  { kind, id?, label }` and the wire schema `screenRefSchema` in `src/types/screen-context.ts`. The app frame
  passes the deepest route's screen to `AskButton` → `AssistantChat` → `ChatComposer`. Settings, login and the
  assistant itself declare nothing.
- **The browser sends only `screen: { kind, id? }`** with the question (`assistantMessageInputSchema`), never
  the label. The server looks it up itself with the kind's registration and ignores unknown kinds and ids
  that aren't the household's (the question then simply goes without it).
- **Skills register their kinds** in their `tools.ts` (`registerScreenContext` from the kit,
  `ai/core/screen-context.ts`):

  ```ts
  registerScreenContext({
    kind: "task",
    skills: ["tasks"],                                // active for the question (main one first)
    describe: async (ctx, id) => {                     // household-scoped; null or a throw = ignored
      if (!id) return null;
      const { task } = await getTaskDetail(ctx.user, id);
      return { label: task.title, summary: `task "${task.title}" (open, due 12/10/2026)` };
    },
  });
  ```

- **What the model gets**: the summary goes with the question (next to the clock time, outside the cached
  system prompt) as a note marked *data, not instructions*, quoted, with the kind and id; "this"/"here"/"dit"
  mean that. The kind's skills count as asked for by that question (its main skill right after the
  question's best keyword match, within `MAX_ACTIVE_SKILLS`). After a confirmation the turn goes on with the
  question's screen, looked up again.
- **Tools** see `ctx.screen` (`{ kind, id? }`, only when found): `screenTarget(ctx, "task")` gives the id on a
  task's page, for a target the model left out. Absent over MCP.
- **Stored** with the question (`AssistantMessage.screen`: kind, id, label as found; never the summary), so
  the history shows the chip; routing reads the kind from there.

Kinds now: detail pages `product`, `place`, `floor` (floor plan), `task`, `shop`, `project`, `expense`,
`recurring_expense`, `event`, `device`, `recipe`, `cooking` (a meal being cooked: recipe, servings, current
step and the ingredients used/needed, so "ik heb nog 1 look extra gebruikt" goes to `recipes_use`); overview pages `recipes`, `shopping` (also per shop), `products`, `inventory`,
`scan`, `tasks`, `places`, `shops`, `projects`, `expenses`, `income`, `money`, `energy`, `calendar`,
`documents`, `devices`, `contacts`. A new page adds its `handle` and, for a new kind, one
`registerScreenContext` in its skill. Eval scenarios take `screen: { kind, name? }` (ai/eval/scenarios.ts).

## Conversations

Per user (`AssistantConversation`, `AssistantMessage` in the OpenAI shape: role, content, tool calls, tool
args/result/status/summary). Title from the first question; rename and delete in the list. Kept **90 days**
after the last message: the job `assistant.cleanup` (daily 03:40, Settings → Automations). Active skills are
derived from the stored messages; nothing extra is stored.

## Voice

Push-to-talk in the chat and the Ask sheet. With `ASSISTANT_STT_URL` the recording goes to our server, which
forwards it to the local Whisper server, so audio stays in the house. Without it the browser's own
`SpeechRecognition` is used (nl-BE / en-GB) where it exists; note that Chrome sends that audio to Google.
The microphone needs HTTPS (home.example.be). Answers to spoken questions are read aloud when "Read answers
aloud" is on: by the speech server's voice when `ASSISTANT_TTS_URL` is set (next section), else by the browser's
`speechSynthesis`. **Voice never confirms anything**: cards need a tap.

## Speech output

A natural voice for reading answers aloud: **Piper** (piper1-gpl, a small neural TTS that runs fine on the
home server's CPU) next to the app, reachable only from the server. The browser never talks to Piper: it asks
`POST /api/assistant/speech` (logged-in users only), and the app streams the WAV through, nothing is kept on
disk and the answer is `Cache-Control: no-store`. Without `ASSISTANT_TTS_URL`, or when the speech server fails
halfway, the browser's `speechSynthesis` reads (the rest of) the answer.

**How an answer is read** (`src/features/assistant/hooks/use-speech-output.ts`, `data/speech-text.ts`):
markdown, bullets and links are stripped; the text is split into sentences (amounts such as "€ 1.234,56",
dates dd/mm/yyyy, times and abbreviations such as "bv.", "o.a.", "nr." don't end a sentence; every list line
does); short sentences go together (the first chunk stays under ~60 characters so the voice starts quickly,
later ones up to ~260, never above 600). Chunk 1 is requested at once and plays in one audio element while the
next one or two are made, one at a time (Piper needs ~0.7 s per second of audio when the server is busy).
Stop, push-to-talk or a new answer stop playback and abort the requests (the server aborts its call to Piper
too). Phones only play sound a tap started, so the read-aloud switch, push-to-talk and Send "unlock" the audio
element with a moment of silence; the answer can then play when it arrives.

**Spoken words** (`data/speech-normalize.ts`, both voices): after splitting, every chunk is written out the
way people say it, in the reading language (Dutch spelling rules: "tweeëntwintig", "honderdeen",
"tweeduizend driehonderdvijftig"; English without "and"). Amounts: "€ 223,72" → "tweehonderddrieëntwintig euro
tweeënzeventig" / "two hundred twenty-three euros seventy-two", "€ 0,50" → "vijftig cent", "-€ 5" → "min vijf
euro". Dates: "05/10/2026" → "vijf oktober" / "the fifth of October", the year only when it isn't this year
("vijf oktober tweeduizend zevenentwintig"); "ma 05/10" → "maandag vijf oktober"; "morgen (05/10/2026)" →
"morgen". Times: "14:30" → "veertien uur dertig" / "fourteen thirty", "08:00" → "acht uur" / "eight o'clock";
ranges "08:00–10:00", "05/10–07/10" → "van … tot …" / "from … to …". Units ("3,2 m", "12 m²", "21 °C",
"4,5 kWh", "15%", "km/h"), "3 x 2,8 m" ("op" / "by"), ordinals, "&", "+", "/" and the common abbreviations
("bv.", "o.a.", "nr.", "ca.", "e.g.", "etc.") become words. IBANs, structured communications, phone numbers and
long reference numbers are read digit by digit in their groups; URLs become "de link", emoji and markdown go.
Anything not recognised passes through unchanged. A chunk that grows past 600 characters is split again.

**Voice choice**: Assistant card (Integrations, or the settings sheet on /assistant) → "Voice for reading
aloud": a voice per language for this device (remembered in the browser), with a Test button that plays a
sample. Names come from the voice id ("nl_BE-rdh-medium" → "Rdh (Flemish, male)"). The default per language is
`ASSISTANT_TTS_VOICE_NL` / `ASSISTANT_TTS_VOICE_EN`. A voice removed from the server falls back to the default.

**Install** (done on the home server, 2026-10-04):

```bash
mkdir -p ~/piper && cd ~/piper
python3 -m venv venv
venv/bin/pip install "piper-tts[http]"
venv/bin/python -m piper.download_voices --data-dir voices nl_BE-nathalie-medium nl_BE-rdh-medium \
  en_GB-alba-medium en_GB-northern_english_male-medium
pm2 start venv/bin/python --name wickedhome-tts --interpreter none --cwd ~/piper -- \
  -m piper.http_server -m nl_BE-nathalie-medium --data-dir /home/wicked/piper/voices --host 127.0.0.1 --port 5005
pm2 save
```

Check it: `curl -s http://127.0.0.1:5005/voices | head -c 200` and
`curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"Hallo"}' http://127.0.0.1:5005/synthesize -o /tmp/t.wav`.
Bind it to 127.0.0.1 only: the Piper server also has a download endpoint.

**More voices**: `cd ~/piper && venv/bin/python -m piper.download_voices --data-dir voices <voice>` (the list:
https://huggingface.co/rhasspy/piper-voices, e.g. `nl_NL-mls-medium`). Piper picks up new files without a
restart; the app's voice list refreshes within 5 minutes (or at once after `pm2 restart wickedhome`). Only
Dutch and English voices are offered.

**Settings** (`.env`):

```
ASSISTANT_TTS_URL=http://127.0.0.1:5005      # the speech server, as reached from this server
# ASSISTANT_TTS_KIND=piper                   # piper (default) | openai
# ASSISTANT_TTS_VOICE_NL=nl_BE-nathalie-medium
# ASSISTANT_TTS_VOICE_EN=en_GB-alba-medium
# ASSISTANT_TTS_SPEED=1.1                    # 0.5–2, 1 = the voice's own pace (piper: length_scale = 1 / speed)
# ASSISTANT_TTS_MODEL=kokoro                 # openai kind only (default tts-1)
```

**Later, on a GPU machine**: `ASSISTANT_TTS_KIND=openai` talks to any OpenAI-compatible speech server
(Speaches, Kokoro-FastAPI, a Chatterbox server…): `POST <url>/audio/speech {model, voice, input,
response_format: "wav"}` with `Authorization: Bearer` from `ASSISTANT_TOKEN` / `ASSISTANT_API_KEY` when set; give
the URL with its `/v1`, e.g. `ASSISTANT_TTS_URL=http://192.168.1.20:8000/v1`. Voices come from
`GET <url>/audio/voices` when the server lists them, else only the two configured ones are offered.

The card shows "Reading aloud: speech server (host)", a warning when it doesn't answer (the browser reads
meanwhile), and a warning for an invalid `ASSISTANT_TTS_URL`, `_KIND` or `_SPEED`; the app never stops over it.

## MCP server

`POST /api/mcp` — Model Context Protocol, Streamable HTTP transport, the stateless subset: one JSON-RPC
request per POST, one JSON response (`GET`/`DELETE` answer 405). Methods: `initialize` (protocol versions
2025-11-25, 2025-06-18, 2025-03-26; the instructions list the skills), `ping`, `tools/list` (every tool the
token may use: MCP clients manage their own context), `tools/call`.

- **Auth**, two equal ways: `Authorization: Bearer wh_mcp_…`, a personal token made on the Assistant card
  (stored as SHA-256, shown once, revocable), or an **OAuth 2.1** access token for ChatGPT/Claude connectors
  (dynamic registration or an owner's OAuth app, consent page, PKCE, rotating refresh tokens): see
  [MCP-OAUTH.md](MCP-OAUTH.md). Either acts as that person with the same scopes. A 401 points to the OAuth
  metadata (`resource_metadata`). A foreign browser `Origin` is refused; rate-limited.
- **Confirmations**: a **read-only** token (the default) lists and calls only read tools. A **read and
  change** token also gets write tools, each with an extra `confirm` boolean; a call without `confirm: true`
  changes nothing and answers what it *would* do (names already resolved), so the client asks its human and
  calls again. Disarming doesn't exist here either.
- Example client config:
  ```json
  { "mcpServers": { "wickedhome": { "url": "https://home.example.be/api/mcp",
      "headers": { "Authorization": "Bearer wh_mcp_…" } } } }
  ```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/assistant/status` | configured, problem, host, model, speech, tools and skills for this person |
| POST | `/api/assistant/status/test` | models + one-token round trip |
| GET | `/api/assistant/conversations` | the person's conversations |
| POST | `/api/assistant/conversations` `{content, voice, imageIds?, screen?}` | new conversation, streamed |
| GET / PATCH / DELETE | `/api/assistant/conversations/:id` | detail (pending cards with preview) / rename / delete |
| POST | `/api/assistant/conversations/:id/messages` `{content, voice, imageIds?, screen?}` | streamed (`screen: {kind, id?}`, see Screen context) |
| POST | `/api/assistant/images` (image body) | `{id}` for the next question (409 when `ASSISTANT_VISION=off`) |
| GET | `/api/assistant/images/:id` | an image of one of the person's own questions |
| POST | `/api/assistant/conversations/:id/confirmations/:messageId` `{decision, remember}` | streamed |
| GET | `/api/assistant/conversations/:id/stream` | attach to the running answer (replay + live); 204 when none |
| POST | `/api/assistant/conversations/:id/stop` | stop the running answer |
| DELETE | `/api/assistant/preferences` | forget every "don't ask again" |
| POST | `/api/assistant/transcribe?lang=` (audio body) | `{text}` via `ASSISTANT_STT_URL` |
| POST | `/api/assistant/speech` `{text (≤ 600), locale: nl \| en, voice?}` | `audio/wav`, streamed, via `ASSISTANT_TTS_URL` (409 not configured, 400 unknown voice, 502 speech server failed) |
| GET | `/api/assistant/voices` | `{configured, ok, kind, host, problem, voices: [{id, locale}], defaults: {nl, en}}` (also `tts` in the status) |
| GET / POST / DELETE | `/api/assistant/tokens`, `/tokens/:id` | MCP tokens `{name, scope: read \| write}` |
| POST | `/api/mcp` | MCP (bearer: personal token or OAuth access token) |
| GET / DELETE / PATCH / POST | `/api/assistant/oauth`, `/connected/:id`, `/settings`, `/apps`, `/requests/:id` | OAuth: connected apps, DCR settings, manual apps, consent ([MCP-OAUTH.md](MCP-OAUTH.md#api)) |
| GET / POST | `/.well-known/oauth-*`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` | the OAuth server ([MCP-OAUTH.md](MCP-OAUTH.md#api)) |

## Checks

- Unit tests (no model, no database): `ai/core/*.test.ts` — registry rules and JSON Schema, safety rules over
  every registered tool, skills and guides, keyword routing, active skills and dynamic loading, resolvers and
  `entityRef`, screen contexts, search, token budget and history compaction, the loop with a fake model incl. confirmation
  pause/resume, the LLM client against a local SSE server, MCP, MCP OAuth (`mcp-oauth.test.ts`); `ai/skills/*/tools.test.ts`;
  `src/features/assistant/data/chat-state.test.ts`; speech output: `ai/core/assistant-tts.test.ts` (settings, a fake
  Piper and a fake OpenAI-compatible speech server, voice checks, errors, abort) and
  `src/features/assistant/data/speech-text.test.ts` (sentence splitting, voice names) and
  `src/features/assistant/data/speech-normalize.test.ts` (numbers, amounts, dates, times, units, codes, symbols).
- `npm run assistant:eval` — ~220 scenarios against the real model on a throwaway database (ai/README.md).
- `npx tsx ai/eval/fake-openai-server.ts` is a keyword-driven fake LM Studio for development
  (`ASSISTANT_BASE_URL=http://127.0.0.1:11234/v1 ASSISTANT_MODEL=fake-model`).
- `npx tsx ai/eval/assistant-runtime-check.ts` runs the whole app end to end against that fake on a throwaway
  database: read tool, write with confirmation, sensitive cancel, refusal, MCP, MCP OAuth end to end.

## Known gaps

- Every successful write through the chat or MCP is in the household audit log (channel `assistant` /
  `mcp`); for OAuth the app's name is recorded with the person ("Rob · ChatGPT"), for a personal token only
  the person.
- Routing is by keywords, with names of listed things (payees, rooms, shops, accounts…) as a fallback when no
  keyword matched ("en Fluvius?" → expenses). Things found only by `search` resolvers (tasks, events) don't
  route; then the conversation's active skills or the model's `skills_load` / `search_everything` do.
- Token counts are estimates (~3.5 characters per token) unless the server reports usage.
- A question that is only a photo (no words) routes to no skill: the skill index's summaries steer
  `skills_load`, but a word like "recept" with a recipe photo is more reliable.
- Voice needs HTTPS; on the LAN address the microphone button shows "not available".
- No streaming over MCP and no MCP resources/prompts; tools only.
