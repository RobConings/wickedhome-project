# Integrations

Status: design (2026-10-03). The app works fully without any integration; each one adds data or actions on top.

## Principles

- **One Integrations page** (`/integrations`, Settings links to it): every integration shows its status (not
  configured / connected / error), what it syncs, last sync, and connect/disconnect. Background syncs are
  scheduled jobs (docs/AUTOMATIONS.md), visible under Automations.
- **Secrets stay on the server.** Server-wide keys live in `.env`; per-user tokens (Google) are stored
  encrypted (AES-256-GCM, key `INTEGRATIONS_KEY` in `.env`) and never reach the browser.
- **Per person where it's personal.** Google is connected per user (Rob's and Clara's own calendars and mail);
  Home Assistant and the assistant are household-wide.
- **Read first, write carefully.** Imports and suggestions come first; writing to an outside system is an
  explicit choice per item or per setting.
- **The assistant uses the same actions as the UI**, through one tool registry, with the same permissions.

## Google (per user): OAuth 2.0 with PKCE

Built 2026-10-03, see *Google as built* below.

Own implementation (no auth library): `/api/integrations/google/start` → Google consent →
`/api/integrations/google/callback` (state + PKCE verified) → refresh token stored encrypted. Scopes are
requested per feature (incremental consent), so connecting Calendar doesn't ask for Gmail.

- **Calendar**: pick which Google calendars to show; their events appear in the WickedHome calendar as a source
  (read-only, colour per calendar, chip in the legend). Optional: publish chosen household categories to one
  Google calendar (one-way push, so phones show family events). Sync job every 15 minutes + on demand,
  incremental with sync tokens.
- **Gmail** (read-only, `gmail.readonly`): find invoices and bills (sender rules per payee, e.g. Fluvius,
  Luminus, Telenet; PDF attachments; amount, due date and structured communication read from the mail or PDF
  text) and offer them as **suggested expenses** with the PDF attached to Documents. Nothing is created
  without a tap. Later the assistant can do better extraction.
- **Drive**: the `GOOGLE_DRIVE` storage provider for Documents: link Drive folders into the drive, browse,
  open, import a copy, and "save to Drive" for local files. Local storage stays the default.

### Google as built (2026-10-03)

Shows **Not configured** with these steps until the owner has done them; nothing else changes meanwhile.

**Owner's setup (once)**

1. On the server: `openssl rand -base64 32` → put it in `.env` as `INTEGRATIONS_KEY=…` (never change it later:
   stored tokens become unreadable and everyone reconnects).
2. [Google Cloud Console](https://console.cloud.google.com/): create a project (e.g. "WickedHome"), then
   *APIs & Services → Library*: enable **Google Calendar API**, **Gmail API** and **Google Drive API**.
3. *OAuth consent screen*: user type **External**, app name WickedHome, support email; add Rob's and Clara's
   Google accounts under *Test users*; add the scopes below (optional, they are requested at runtime anyway).
   Then **Publish app** ("In production"): in *Testing* mode Google expires refresh tokens after 7 days. The
   app stays unverified (fine for < 100 users): at consent everyone sees "Google hasn't verified this app" →
   *Advanced* → *Go to WickedHome (unsafe)*.
4. *Credentials → Create credentials → OAuth client ID → Web application*. Authorised redirect URI:
   `https://home.example.be/api/integrations/google/callback` (exactly; no JavaScript origins needed).
5. Put the client's ID and secret in `.env`: `GOOGLE_CLIENT_ID=…`, `GOOGLE_CLIENT_SECRET=…`
   (`GOOGLE_REDIRECT_URI` only if the address differs). Restart: `pm2 restart wickedhome` (and/or
   `wickedhome-dev`).
6. Everyone opens **https://home.example.be/integrations** (not the LAN address: Google sends the browser back
   to the redirect URI's origin) and turns on Calendar, Bills from Gmail and/or Drive.

**Scopes, per feature (asked only when that feature is turned on; `include_granted_scopes`)**

| Feature | Scope | Why this one |
|---|---|---|
| always | `openid email` | Which Google account it is (shown on the card) |
| Calendar | `calendar.readonly` | Calendar list + events of every calendar; read-only |
| Publish household events | `calendar.events` | Create/update/delete events; only asked when someone turns publishing on |
| Bills from Gmail | `gmail.readonly` | Search and read mails + attachments; WickedHome can never send, delete or label |
| Drive | `drive.readonly` + `drive.file` | `drive.file` alone only sees files the app made (or picked with Google's Picker, which would need Google's script and an access token in the browser). Browsing a linked folder needs `drive.readonly`; "Save to Drive" writes only with `drive.file`, into a "WickedHome" folder the app creates. Nothing in Drive is ever changed or deleted (except bill documents with "Also remove from Drive" on, below) |
| Bill documents into an existing folder | `drive` (restricted) | Only when someone chooses *Existing folder* for bill documents: `drive.file` can't add files to a folder the person made. A new folder made by the app needs nothing extra. See *Drive as storage for bill documents* |

**OAuth flow** (`src/api/integrations/google-oauth.ts`, `google-connection.service.ts`; no library)

- `POST /api/integrations/google/start {features}` → a `google_oauth_states` row: SHA-256 of a random state,
  the PKCE verifier (S256) encrypted, the session id, the scopes; valid 10 minutes. The browser goes to Google.
- `GET /api/integrations/google/callback?code&state` is public: the `SameSite=Strict` session cookie is not sent
  on a navigation coming from accounts.google.com. It only stores the code (encrypted) on the unexpired, unused
  state row (a replay finds it used) and redirects to `/integrations?google=finish` (`denied`/`expired`/`error`).
- The Integrations page then calls `POST /google/finish` (a same-site fetch: cookie sent). Only the session that
  started the round can finish it; the row is deleted first (single use), code + verifier are exchanged at
  `oauth2.googleapis.com/token`, the account comes from the ID token, the **refresh token is stored encrypted**
  (AES-256-GCM, `src/api/lib/secrets.ts`, context `google:refresh:<userId>`). Access tokens live in memory only
  (refreshed a minute before expiry; one refresh shared by concurrent callers; a 401 retries once).
- Google refusing the refresh token (`invalid_grant`: revoked, expired) marks the connection *Reconnect needed*.
- **Disconnect** revokes the token at Google (`oauth2.googleapis.com/revoke`) and deletes the connection with its
  calendars, cached events, publish mappings, pending mail suggestions and Drive links (cascade).
- Outbound calls (`google-http.ts`): https only, allow-list of Google hosts, no redirects, timeouts, capped
  bodies, short error messages without tokens or mail content. `fetch` is injectable for tests.

**Calendar** (`google-calendar.service.ts`, `google-calendar-mapping.ts`, source `google-calendar.source.ts`)

- The calendar list is stored (`google_calendars`); the main calendar is shown by default. Per calendar: show or
  not, and who sees it: *the whole household* or *only me* (the calendar source gets the viewer's `userId`).
- Events are copied into `google_calendar_events` (one row per occurrence; Google expands recurring events):
  a first full sync from 90 days back, then incremental with Google's sync tokens; 410 Gone → full resync.
  The WickedHome calendar reads only this copy, so it is fast and works when Google doesn't answer.
- Source `google` ("Google Calendar" chip in the legend): read-only items in the calendar's colour, the person's
  habitant as participant, opening goes to the event in Google Calendar. All-day end dates are converted from
  Google's exclusive end; timed events are instants and the days they touch are computed in Europe/Brussels.
- Job **`integrations.google-calendar`** every 15 minutes (`*/15 * * * *`) for everyone; *Sync now* on the card.
- **Publishing** (off by default): a writable target calendar + household event categories. The job pushes those
  events one-way (recurrence as RRULE, timed events in Europe/Brussels), sends an event only when its content
  hash changed (`google_published_events`), moves them when the target changes and removes them from Google
  when they leave the selection or publishing is turned off. Changes made in Google are not copied back.
- **New events straight into a Google calendar** (`google-calendar.writer.ts`, a calendar writer, see
  `src/api/calendar/calendar-sources.ts`): the event form's "Calendar" choice and the assistant's
  `calendar.add_event` `calendar` offer the person's own shown calendars they may change (owner/writer, so a work
  calendar shared with "make changes" too) once writing (`calendar.events`) is allowed. The event is created in
  Google (a plain event: no category, people or shop) and that calendar is synced at once, so it shows once.
  Editing or deleting it happens in Google (the entry opens there).
- **Instant publishing** (`google-calendar-push.ts`): the calendar API emits `onCalendarEventChanged`
  (`src/api/calendar/calendar-events.ts`: `{ householdId, eventId, change: "created" | "updated" | "deleted" }`,
  after the commit, from every create/update/delete in `calendar.service.ts`, so the routes and the assistant;
  a recurring series is one event). The calendar never imports integrations. Integrations subscribes once
  (guarded against dev reloads) and collects the event ids per household; 3 s after the last change (at most
  30 s while edits keep coming) it pushes just those events, outside the request, for every connection of the
  household that publishes (or published one of them before): `publishHouseholdEvents(connection, { eventIds })`
  creates, updates, or removes it when it was deleted or moved to a category that isn't published, and leaves
  every other published event alone. Pushes per household run one after the other, and all publishing of one
  connection (job, *Sync now*, instant) is serialised so an event is never created twice. A successful push sets
  *Last published*; a failure is stored as the connection's `publishError` (shown on the card) and the
  15-minute job, which still reconciles everything, retries it and clears the error. Pushes still waiting when
  the server restarts are picked up by that job too. Unit tests: the hook in `calendar.test.ts`, subset plans
  and the debounce in `google.test.ts`. `scripts/calendar-push-runtime-check.ts` runs create → pushed (~3 s, the
  save itself makes no Google call), a burst of edits → one update, category no longer published → removed
  (others kept), delete → removed, Google down → `publishError` → the job publishes it, against a fake Google
  Calendar on a throwaway database.

**Bills from Gmail** (`gmail.service.ts`, `gmail-extract.ts`, `pdf-text.ts`, rules `gmail-rules.ts`)

- Sender rules are household-wide (`mail_bill_rules`): built-in Belgian providers (Fluvius, Luminus, Engie,
  TotalEnergies, Eneco, Mega, Telenet, Proximus, Orange, BASE, Scarlet, De Watergroep, Water-link, Farys, Pidpa,
  AG Insurance, Ethias, P&V) seeded per household, editable or switchable off; own rules can be added (address
  or domain, payee, expense category). Integrations → Google → *Senders…*.
- Job **`integrations.google-mail`** every 30 minutes at :10 and :40 (+ catch-up), and *Search mail now*: per connected
  mailbox the Gmail search `from:(…) has:attachment filename:pdf after:…` (first 60 days, then from a day before
  the last search), at most 100 mails per run. Per matching mail with a PDF: amount (`€ 1.234,56`, `89,90 EUR`,
  `€89.90`; the amount after "te betalen / totaal / à payer / amount due" wins), due date (NL/FR/EN keywords and
  date formats), structured communication (mod-97) and IBAN (mod-97) are read from subject, body and the PDF's
  text (pdfjs-dist legacy build, first 4 pages, no rendering, 15 s limit; PDFs over 5 MB only by body).
- A **suggestion** keeps only those fields, the subject (200 characters), the message id and the PDF's part id;
  never the mail. De-duplication per household: the same structured communication, else payee + amount + due
  date (the same bill in Rob's and Clara's mailbox gives one suggestion), and nothing is suggested when an
  expense with that structured communication exists.
- Expenses → Upcoming shows **Suggested from mail** (owners and adults; composed by the route through the
  expenses `suggestions` slot). *Accept* (*Add as new* when there is a strong match) opens the expense form
  prefilled; when it is saved the PDF is fetched from Gmail again, stored in Documents and attached to the
  expense. *Link…* attaches it to an expense that already exists (next section). *Dismiss* hides it.

**Linking a mail to an existing expense** (2026-10-03; pure rules `features/integrations/types/mail-matching.ts`,
UI `mail-link-dialog.tsx`)

- **Matches**, computed for every pending suggestion when the list loads (nothing stored): unpaid one-off
  expenses and instances of recurring expenses, plus the computed occurrences of active recurring expenses
  beyond the generated horizon (as the calendar shows them), due within ± 20 days of the mail's due date (no
  due date: two weeks after it arrived). A candidate needs an *identity*: the same payee (normalised: case,
  accents, punctuation and legal forms like NV/SA ignored; equal, one starting or ending the other, or a shared
  word of 4+ letters, never a shared number; also against the sender rule's domain name, "luminus.be" → Luminus,
  and the expense's beneficiary), the same IBAN, the same structured communication, or the sender's remembered
  recurring expense; and *proximity*: the same OGM, a due date within 20 days, or the amount (exact; ± 15 % for
  variable bills: categories energy and water, kind utility). Score: OGM 100, remembered 70, payee 40, IBAN 30,
  exact amount 30, close amount up to 20, date up to 25 (nearer is more). Ranked by score, then the nearest
  due date; at most 5. From 65 the best one is shown as **"Looks like: Luminus · 22 Oct 2026 · € 225,00
  (recurring)"** and *Link* becomes the main button (tapping it opens the review straight away); below that
  it says "Maybe: …". Paid expenses are never suggested (but can be searched).
- **The link dialog** (bespoke: a multi-step flow): *Matches* (with why: same communication, IBAN, payee,
  amount…), *Expenses* (a `GeneralList` with search over unpaid and paid expenses from a year before to four
  months after the mail, nearest first, at most 300) and *Recurring* (every recurring expense, active first).
  Picking a recurring expense shows its payments around the mail (7 nearest within ± 200 days) with the one
  nearest to the mail's due date preselected ("Best fit"); one without a row yet says it is created when
  linking.
- **Review**: the target, then per field a checkbox with **before → after** for amount, due date, structured
  communication (replacing a free-text reference), IBAN and beneficiary (only with an IBAN; compared with the
  payee it falls back to). Only fields the mail has and that differ are offered. Ticked by default: amount,
  due date and OGM of an **unpaid** expense; IBAN and beneficiary never; a **paid** expense starts with nothing
  ticked and warns that ticking the amount or due date changes what was paid (the API refuses those without
  `allowPaidChanges`, which the dialog only sends for rows the person ticked under that warning). For a
  recurring target, *Update the recurring expense too* offers the template's IBAN / OGM / beneficiary when
  they are missing or different (never ticked): the template changes and its upcoming unpaid instances that
  still had the old value follow (the linked instance only gets what was ticked for it). *Always link mails
  from Luminus to Luminus energie* stores the recurring expense on the sender rule (`mail_bill_rules.
  recurringExpenseId`); switching it off forgets it.
- **Remembered senders**: their next suggestions come pre-matched to the occurrence nearest to the mail's due
  date (whatever the distance, materialised or not), shown as "Looks like … · Always linked"; still a tap.
- **Linking** (`POST …/suggestions/:id/link`): resolves the target (an occurrence without a row is created
  through the expenses service: beyond the horizon of an active recurring expense the instances are
  materialised up to that date the normal way, so the horizon stays one range and later top-ups don't double
  it; a skipped date gets just that instance), claims the suggestion (`status LINKED`, `expenseId`) so a double
  tap can't link or attach twice, applies the chosen fields (`patchExpenseDetails`; split shares rescaled), the
  template fields (`patchRecurringPaymentDetails`), the rule, then attaches the PDF like Accept (fetched again
  from Gmail; a failure keeps the link and says so). Every change goes through the expenses service, which
  emits `onExpenseChanged`, so pay tasks follow ("Betaal … · € 212,34"). The same request again answers
  `alreadyLinked`; linking a handled mail elsewhere is a 409. If applying fails, the claim is undone.
- **"From mail on 2 Oct 2026"** next to the PDF in the expense's Documents panel: the route passes
  `useMailFileNote(expenseId)` (integrations) as `DocumentAttachments`' `fileNote`; `GET …/mail/origins?expenseId=`
  lists accepted/linked suggestions with their document.
- **API** (owners/adults unless noted): `GET …/mail/suggestions` (with `matches`, `rememberedRecurringId`) ·
  `GET …/suggestions/:id/link-options` · `GET …/suggestions/:id/occurrences?recurringExpenseId=` ·
  `POST …/suggestions/:id/link` `{ target: {expenseId} | {recurringExpenseId, dueDate}, apply[], allowPaidChanges,
  updateRecurring[], remember? }` · `GET …/mail/origins?expenseId=` (any member). From the expenses service
  (one way: integrations → expenses): `listPaymentTargets`, `getPaymentTarget`, `listRecurringExpenses`,
  `getRecurringExpense`, `listRecurringOccurrences`, `ensureRecurringInstance`, `patchExpenseDetails`,
  `patchRecurringPaymentDetails`.
- **Tests**: `src/api/integrations/mail-matching.test.ts` (names, ranking incl. variable amounts, virtual
  occurrences and remembered senders, occurrence choice, diff defaults, the paid guard, re-linking changes
  nothing, the link body). `scripts/mail-link-runtime-check.ts` runs it against the app on a throwaway copy of
  the dev database with fake suggestions: link to a one-off (pay task follows the amount), idempotent and
  concurrent links, the paid guard, link to an occurrence beyond the horizon (materialised, no gaps or
  doubles, template OGM for upcoming payments), the remembered sender pre-matching the next mail, origins.
- **Known gaps**: the remembered link can only be removed from the link dialog (not from *Senders…*); matching
  doesn't read the amount's sign (credit notes) or split a mail that covers several expenses.

**Drive** (`google-drive.service.ts`, provider `documents/storage/google-drive-storage-provider.ts`)

- *Link a Drive folder* (card → folder picker of My Drive): it appears at the top of Documents with a Drive badge
  for the whole household, read through the linker's connection. `/documents/drive/:linkId` browses it live;
  every file is checked to lie below the linked folder (a file id from elsewhere in that Drive is a 404).
- Per file: open / download through the server (same safety headers as Documents: inline only for safe types,
  CSP sandbox, nosniff), *Open in Drive*, *Import a copy* (stored locally, size limit as uploads) and *Add to
  Documents (stays in Drive)*: a `GOOGLE_DRIVE` document (`storageKey gdrive:<connection>:<fileId>`) whose bytes
  stream from Drive (ranges passed through); deleting it in WickedHome never deletes it in Drive. Google Docs,
  Sheets, Slides and Drawings are exported as PDF (copy only); other Google types only open in Drive.
- *Save to Drive* in a local document's ⋯ menu (people with Drive on): a copy into their "WickedHome" folder.
  New uploads stay local, except bill documents when the household stores them in Drive (next section).

### Mail through the assistant (2026-10-04)

The assistant works with each person's **own** Gmail (`src/api/mail`, `ai/skills/mail`); nobody ever sees
another household member's mail, children never.

- **Reading** uses the `gmail` feature (`gmail.readonly`): search (Gmail syntax plus from/to/subject/dates/
  attachment/unread), read a message or thread as short text (HTML → text, quoted replies and obvious
  signatures cut, capped), save an attachment to Documents (folder, project and/or expense).
- **Sending** is its own feature, `gmail_send` (`gmail.send` + `gmail.compose`), asked only when the person
  turns on "Send mail from the assistant" under Google › Gmail on the Integrations page (one extra consent).
  Mails are built by hand (`mail-mime.ts`: UTF-8 subjects, base64 bodies, RFC 2231 file names, reply
  headers; no dependency) and go through Gmail's multipart upload (35 MB). Every mail is shown on a card first;
  the person taps **Send** or **Save as draft** and may edit subject and body there. Without the permission
  the assistant gets a clear message where to turn it on.
- **Projects**: a mail written for a project (or to a contact), or a thread the person links, is stored as a
  link in `mail_thread_links` (thread id, subject, who wrote last; never the mail). The job `mail.replies`
  (every 10 minutes) checks linked threads in the owner's mailbox; a newer message from someone else becomes
  the notification `mail.reply` (priority high, only to that person, preferences respected). The project page
  lists the person's own linked threads with "Open in Gmail".
- Mail content is untrusted: read results are marked as data for the model, and nothing a mail says is done by
  itself; mail tools are chat only (refused over MCP).

### Drive as storage for bill documents (2026-10-03)

The household can save **bill documents** (files attached to expenses, one-off, recurring and their instances,
and the PDFs of accepted/linked mail suggestions) in a folder of one person's Google Drive instead of on the
server. They keep opening in WickedHome (streamed through the server, ranges passed through, same safety
headers), with a **Drive** badge.

**Owner's setup**: Integrations → **Bill documents in Google Drive** (owners and adults). The person whose Drive
it will be (Drive turned on on the Google card) chooses:

- *New folder* (default name "Facturen"/"Bills") → created in their My Drive with the `drive.file` scope they
  already granted. They can move or rename it in Drive later; it keeps working (Drive ids don't change).
- *Existing folder* (e.g. a "Facturen" they made) → needs the full `drive` scope, asked only now ("Allow access
  to my Drive"; Google's "not verified" screen → Advanced → Go to WickedHome; fine for an unverified app with
  test users / under 100 users). Then a folder picker of their My Drive.
- *A subfolder per year* (on by default): "2026", found or created when needed (Brussels upload date).

Then *Move N documents to Drive* moves the bill documents that are still on the server (with progress).

**Why this scope choice**: `drive.file` covers only what the app created (or what was opened with Google's
Picker, which needs Google's script and an access token in the browser). A folder the app creates is therefore
the cleanest default: no new consent, no warning screen. Writing into a folder the person made is impossible
with `drive.file`, so that option asks for `drive` incrementally and only for whoever picks it.

**How it works** (Google-agnostic part in documents, Drive part in integrations):

| Piece | What |
|---|---|
| `STORAGE_TARGETS` (documents contract) | Target registry: `bills` = files linked to entity type `bill`. Add e.g. `manuals: ["appliance"]` later. |
| `documents/storage/storage-targets.ts` | The handler interface an integration registers (`state`, `upload`, `discard`, `report`), the retry schedule, verification and `verifiedMove`. |
| `documents/document-targets.service.ts` | Routing after an upload, queueing (attach, "move existing"), the verified move, counts, the retry job's loop. |
| `integrations/drive-storage.service.ts` | Target settings (`google_drive_storage_targets`), Drive folders and year folders, the handler, "Also remove from Drive". |
| `integrations/drive-upload.ts` | Resumable upload: 8 MiB chunks from the local copy by range; a failed chunk asks the session how far it got and resumes (4 tries). |

- **Upload**: the browser uploads as before (two steps, progress, size/type checks, household scoping). The server
  stores the bytes locally first, then (same request, at most 2 minutes) uploads them to Drive, **verifies** the
  copy (same size and Drive's own `sha256Checksum`, else `md5Checksum`, against our digest and the SHA-256 recorded
  at upload), points the document at Drive (`storageProvider GOOGLE_DRIVE`, key
  `gdrive-target:<kind>:<userId>:<driveFileId>`, `externalId`) and only then deletes the local copy. A copy that
  fails verification is deleted from Drive (it was ours) and the local file stays.
- **Fallback**: Drive unavailable (network, quota, consent refused, scope missing) → the file stays local,
  `pendingTarget = "bills"` ("Waiting for Drive" badge), and job **`documents.move-to-targets`** (every 15 min,
  catch-up; Settings → Automations) retries: 5 min, doubling, at most every 12 h, never giving up; from 5 failed
  attempts the card calls them failed. The card shows the waiting count and the last problem.
- **Attaching** an existing local document to an expense queues it the same way.
- **Disconnect**: the target stays but is *paused*: new bill documents are saved on the server (not queued), the
  card and the disconnect confirmation warn that documents already in that Drive don't open in WickedHome until the
  same Google account connects again (keys are per user, so they work again after reconnecting). A refused consent
  (*Reconnect needed*) or a missing scope queues files instead, and they move once fixed.
- **Deleting**: trashing in WickedHome changes nothing in Drive. Deleting for good (emptying the trash) moves the
  Drive file to Drive's trash only when *Also remove from Drive* is on (default off). *Stop saving to Drive* keeps
  every file where it is and clears the queue.

**Data**: `GoogleDriveStorageTarget` (household + kind unique; whose Drive, folder id/name, CREATED/PICKED, year
subfolders + their ids, delete in Drive, last error/move) and on `DocumentFile`: `pendingTarget`, `targetAttempts`,
`targetNextAttemptAt`, `targetError`.

**API** (owners/adults): `GET /api/integrations/google/drive/storage` · `PUT …/storage/:kind` `{mode: "create",
folderName, yearSubfolders}` or `{mode: "pick", driveFolderId, yearSubfolders}` (always the caller's own Drive) ·
`PATCH …/storage/:kind` `{yearSubfolders?, deleteInDrive?}` · `DELETE …/storage/:kind` ·
`POST …/storage/:kind/move-existing` → `{queued}`.

**Tests**: `src/api/documents/storage-targets.test.ts` (target resolution, retry selection and backoff,
verification, move order: the local copy is deleted only after verification and the guarded re-point),
`src/api/integrations/drive-storage.test.ts` (scope decision, target states, year folders, keys, resumable upload
against a fake Drive incl. a partial chunk, a 503 and a dropped connection). `scripts/drive-storage-runtime-check.ts`
runs upload → Drive, fallback → retry, and "move existing" with verification against a fake Drive on a throwaway
database.

**Known gaps**: one target folder per kind (in one person's Drive); Shared drives aren't offered in the picker;
files renamed in WickedHome keep their old name in Drive; a document moved to Drive stays there when the target is
switched to another folder or person (only new files go to the new folder); an upload interrupted by a server
restart starts over (the resumable session isn't kept).

**Tests and checks**: `src/api/integrations/google.test.ts` (secrets, PKCE/state, token refresh against a fake
token endpoint, token cache, calendar mapping incl. all-day and time zones, publish plan, mail extraction incl.
OGM and Belgian amounts, de-duplication, PDF text). The whole flow (OAuth round, calendar full/incremental/410,
publishing, Gmail scan + accept, Drive link/browse/import/provider/save, disconnect) was run against a fake Google
on a throwaway database.

**Known gaps**: no push notifications from Google (polling every 15 min / 2 h); Gmail extraction is pattern-based
(the assistant can do better later); Drive "Shared drives" and "Shared with me" aren't offered in the folder
picker; a linked folder stops working when its owner disconnects; publishing is one target calendar per person.

## Home Assistant (household)

URL + long-lived access token. A WebSocket client in the server process (auto-reconnect, backoff) does:

- **Entities → devices**: browse HA entities and bind device fields to them (`DeviceFieldValue.haEntityId`
  / attribute); live `state_changed` events update device values and stream to the browser over SSE;
  staleness per profile.
- **Energy**: read `energy/get_prefs` (grid, solar, battery, device consumption) and import hourly
  `recorder/statistics_during_period` into energy intervals (source `home_assistant`), so solar, batteries and
  per-appliance use fill in automatically; "unknown" shrinks as appliances get measured.
- **Alarm (Verisure via HA)**: show the alarm panel state and history. **Arming** needs an explicit
  confirmation in the UI. **Disarming is never offered to the assistant or voice**; in the UI it needs the
  code, and is logged.
- **Climate and appliances**: temperatures per room on the floor plan, dryer/washer running, window and door
  sensors, via the device profiles and indicator rules that already exist.

### Home Assistant as built (2026-10-03)

**Owner's setup steps** (also shown on the card while it isn't configured):

1. Install Home Assistant on the LAN (e.g. this server, `http://192.168.1.10:8123`) and finish onboarding.
2. In Home Assistant → Settings → Devices & services, add: **Verisure** (alarm; note whether it asks for the
   code to arm), **DSMR Smart Meter** (P1 cable) or **HomeWizard Energy** (P1 Wi-Fi dongle) for the digital
   meter, the **inverter** integration (solar; SMA, SolarEdge, Fronius, Huawei… or a smart plug), smart plugs
   with energy metering for the washer and dryer, and any door/window/temperature sensors.
3. Settings → Dashboards → **Energy**: grid consumption per tariff (tariff 1 = day, 2 = night in Belgium) and
   return to grid, solar production, battery, gas, and the plugs under *Individual devices*.
4. Your profile (bottom left) → **Security** → **Long-lived access tokens** → *Create token*. An admin user's
   token (the registries and statistics need admin). Copy it once.
5. In `/var/www/WickedHome/.env`: `HOME_ASSISTANT_URL=http://192.168.1.10:8123` and
   `HOME_ASSISTANT_TOKEN=<token>` (only with several households in one database also
   `HOME_ASSISTANT_HOUSEHOLD_ID`). Then `pm2 restart wickedhome`. The token never leaves the server.
6. Open **Integrations** (or **Home Assistant** in the menu): the card shows *Connected*. On the Home Assistant
   page, import devices, link the energy plugs to appliances, and place the new devices on the floor plan.

**Pieces** (`src/api/home-assistant/`, UI in `src/features/home-assistant/`):

| File | What |
|---|---|
| `ha-client.ts` | WebSocket client: auth handshake, numbered commands with timeouts, subscriptions re-sent after every reconnect, ping every 30 s (no pong in 10 s → reconnect), backoff 1 s → 5 min ±20 % (`ha-backoff.ts`; a rejected token waits 5 min). Its generic `sendCommand` refuses `alarm_disarm`. |
| `ha-connection.ts` | The one connection: started by `server.ts` next to the scheduler, stopped on SIGINT/SIGTERM. In-memory copy of every state (`get_states`, then `state_changed`), areas from the registries, status (not configured / connecting / connected / error) pushed as `home_assistant.status` over SSE. |
| `ha-device-sync.ts` | Index entity → bound fields (only `source = HOME_ASSISTANT`); every `state_changed` (state or attribute) → `setDeviceValue(…, "home_assistant")`, so `valueAt` moves on every report and `device.value` streams to browsers. On (re)connect and on a new binding (hook `src/api/devices/device-hooks.ts`) the current state is applied at once. |
| `ha-state-mapping.ts` | State → field value: on/off, open/closed → boolean; numbers (state or attribute) → number; alarm states onto the preset's choices (armed_night → armed_home…); `unavailable`/`unknown` → unknown. Import suggestions per entity. |
| `ha-energy-prefs.ts`, `ha-energy.ts` | `energy/get_prefs` (legacy `flow_from`/`flow_to` and the flat grid shape, solar, battery, gas, devices with `included_in_stat`) → meters; hourly `recorder/statistics_during_period` (`change`, kWh / m³) → intervals. |
| `ha-alarm.ts`, `alarm-guard.ts` | Alarm overview (state, `history/history_during_period` of 7 days, audit log), arm, disarm. |
| `home-assistant.jobs.ts` | `home-assistant.energy` (hourly at :07, catch-up; the first connection starts it with a backfill) and `home-assistant.refresh-states` (every 15 min: re-applies states reported again without a change). |
| `ai/skills/alarm/tools.ts` | Assistant tools `alarm.status` (read), `alarm.arm_home` / `alarm.arm_away` (sensitive, always confirmed, owners/adults, no code). Never disarm. |
| `ha-notifications.ts` | Notifications ([NOTIFICATIONS.md](NOTIFICATIONS.md)): alarm went off (urgent, everyone), armed/disarmed (owners by default, with who did it in WickedHome), Home Assistant unreachable > 15 min and back (owners). |
| `scripts/fake-home-assistant.ts` | A fake Home Assistant (WebSocket + control API) for development and runtime checks. |

**API** (`/api/home-assistant`): `GET /status` · `POST /test` (owner/adult) · `GET /entities`,
`GET /suggestions`, `POST /import` (owner/adult) · `PUT /settings` (alarm panel, energy import on/off,
backfill days) · `GET /alarm` (log for owner/adult only) · `POST /alarm/arm` `{ mode, confirm: true, code? }` ·
`POST /alarm/disarm` `{ code }` · `GET /energy` · `PUT /energy/links` · `POST /energy/import`.
Not connected → 503 `ha_unavailable` / `alarm_unavailable`.

**Data**: `HomeAssistantSettings` (per household: alarm panel, energy import, backfill days, last import) and
`AlarmActionLog` (who, what, result, Home Assistant's error; never the code). Energy uses `EnergyMeter`
(`source = HOME_ASSISTANT`, `haStatisticId`) and `EnergyInterval`; devices use the existing
`DeviceFieldValue` binding columns.

**UI**: the card on `/integrations` (status, version, entity count, last event, setup steps, *Test
connection*); `/home-assistant` (card, alarm, device import, energy sources and statistic → appliance links,
entity browser, alarm log); *Browse* next to each field under a device's value sources (entity browser with
search by name/domain/area, attribute choice); the alarm card on the House page and under the house status on
the dashboard; temperature per room on the House page.

**Alarm safety**: arming needs `confirm: true`, which only the confirmation dialog sends; the code only when
the panel has `code_arm_required`. Disarming: a signed-in owner or adult in the app (`alarm-guard.ts`; the
assistant, MCP and voice are refused even with an owner's account), always with the code (sent to
`alarm_control_panel.alarm_disarm`, never stored, scrubbed from error texts), at most 5 attempts per person
and 10 per household per 15 minutes, every attempt logged (succeeded / failed / refused / rate limited).
`ALARM_ACTION_POLICY` in the contracts says the same for the tool registry, which also refuses any tool whose
name or arguments mention disarming or unlocking.

**Energy rules**: per meter the import starts at its last stored hour minus 3 (Home Assistant may correct
recent hours), or the first time `energyBackfillDays` (30) back, rounded down to the first of that month so
month buckets are whole. Upserts per meter and hour, so reruns change nothing. The summary keeps per bucket
only the best source (Home Assistant > Fluvius > manual), so it never adds up with Fluvius data. A device
nested in another (`included_in_stat`) is subtracted from its parent per hour when both are linked (changing
such a link re-imports the parent). Gas in m³ keeps the volume and is converted with the household's
calorific value.

**Known gaps**: a gap in Home Assistant's statistics inside a month makes that month's year-view bucket use
Home Assistant only (Fluvius fills the day and week views); statistics older than the first backfill window
(`energyBackfillDays`, settable over the API only) aren't fetched; no history of device values; the alarm
card follows one panel (pick it on the Home Assistant page when there are several); one Home Assistant per
server; `npm run job -- home-assistant.energy` fails (the connection lives in the app process; use *Import now*
or *Run now* under Automations instead).

## Assistant (LM Studio on the LAN)

OpenAI-compatible endpoint (`ASSISTANT_BASE_URL`, model name). Chat page `/assistant` (and a quick button
everywhere) with streaming answers.

- **Tool registry**: features register tools with a zod schema, a permission (read / write / sensitive), and
  a confirmation rule. Examples: what's on today, open tasks, add to the shopping list, log an expense, enter
  this month's meal vouchers, mark a task done, what's due this week, energy today.
- **Confirmations**: writes show a confirmation card before they run (or a per-tool "don't ask again"
  for harmless ones like adding to the shopping list). Sensitive tools (payments, alarm arming) always ask.
  Alarm disarm is not a tool.
- **MCP server**: the same tools exposed over MCP (`/api/mcp`, token per user), so other assistants on the
  LAN can use them.
- **Voice**: push-to-talk in the browser; speech-to-text with an open-source model (Whisper via a local server,
  or the browser's built-in recognition as a fallback), answers optionally read out (browser TTS).

### Assistant as built (2026-10-03, core rebuilt 2026-10-04)

Everything about the assistant now lives in **`ai/`** ([ai/README.md](../ai/README.md); setup and API in
[ai/docs/ASSISTANT.md](../ai/docs/ASSISTANT.md)): skills with keyword routing and short guides, only the
active skills' tools per request, names resolved to ids, compact results, a household snapshot in the
prompt, confirmation previews and an eval (`npm run assistant:eval`). The notes below are the original
build; paths moved from `src/api/assistant` → `ai/core` and `src/api/<feature>/<feature>.assistant.ts` →
`ai/skills/<skill>/tools.ts`. Shows "not configured" with the setup steps until the owner sets it up:

1. **LM Studio** on the PC: download a model with tool support (Qwen 2.5 7B Instruct or Qwen 3 8B, Q4_K_M; 14B
   with more video memory). Developer tab → load it → Settings → **Serve on Local Network** → start (port 1234).
   Give the PC a fixed IP in the router.
2. `.env` on the server: `ASSISTANT_BASE_URL=http://<pc-ip>:1234/v1`, `ASSISTANT_MODEL=<identifier as LM Studio
   shows it>`; optional `ASSISTANT_API_KEY`, `ASSISTANT_STT_URL` (local Whisper, OpenAI-compatible) and
   `ASSISTANT_STT_MODEL`. Then `pm2 restart wickedhome` and **Test connection** on the card.

- **Registry** `ai/core/tools.ts` (then `src/api/assistant/tools.ts`); 15 seed tools from tasks, shopping, calendar, expenses, income,
  energy, waste, weather and inventory (`src/api/<feature>/<feature>.assistant.ts`), plus the Home Assistant
  feature's `alarm.status` and `alarm.arm_home` / `alarm.arm_away` (sensitive). The registry refuses any
  disarm/unlock tool by name or argument value, forces sensitive tools to always ask and alarm actions to be
  sensitive.
- **Chat** `/assistant` + the **Ask** button on every page: streamed answers (SSE over POST), tool chips,
  confirmation cards ("don't ask again" only for harmless writes: adding to the shopping list, adding or
  completing a task), conversations kept 90 days (`assistant.cleanup`).
- **MCP** `POST /api/mcp` (Streamable HTTP, stateless JSON responses; hand-written, no SDK): personal bearer
  tokens (hashed, shown once) made on the Assistant card. Read-only tokens by default; "read and change"
  tokens still need `confirm: true` on every write call.
- **Voice**: push-to-talk; local Whisper via the server when `ASSISTANT_STT_URL` is set, else the browser's
  recognition; read-aloud with browser TTS. Needs HTTPS for the microphone. Voice never confirms.

## Later

Bank import (CODA / CSV from the bank) to reconcile the joint accounts, more waste providers. (Notifications to
phones are built: [NOTIFICATIONS.md](NOTIFICATIONS.md); the alarm, Home Assistant offline and Gmail bill
suggestions send them.)
