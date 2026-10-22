# Notifications

Bins tonight, a payment due, the alarm: on everyone's phone and in the app. Two halves:

- **The notification center**: every notification is stored per person. A bell in the app frame (top bar on phones,
  next to the account in the sidebar) and the **Notifications** menu item show the unread count, live over SSE;
  `/notifications` lists them (tap = mark read + open its page, *Mark all as read*). Kept 90 days.
- **Web Push**: the same notification on the person's phones and computers, through the browser's push service
  (Google, Apple, Mozilla, Microsoft), also when WickedHome is closed. Needs HTTPS: https://home.example.be.

| Part | Where |
|---|---|
| `notify()`, preferences, quiet hours, de-dupe | `src/api/notifications/notify.ts`, `notification-policy.ts` |
| Kinds registry, scheduled notifiers | `notification-kinds.ts`, `scheduled-notifiers.ts` |
| Web Push (VAPID + encryption) | `web-push.ts` (wrapper around the `web-push` package), `vapid-keys.ts`, `push-delivery.ts` |
| API `/api/notifications` | `notifications.routes.ts`, `notifications.service.ts` |
| Jobs `notifications.dispatch` (every 5 min), `notifications.prune` (04:10) | `notifications.jobs.ts` |
| Contract | `src/features/notifications/types/notifications.ts` |
| UI: bell, center, Settings → Notifications, "Notify me" | `src/features/notifications` |
| Service worker: `push`, `notificationclick` | `public/sw.js` |
| Data | `prisma/schema/notifications.prisma`: `notifications`, `push_subscriptions`, `notification_preferences`, `web_push_keys` |

## Turning it on (for everyone in the household)

### Android (Chrome, Edge, Samsung Internet, Firefox)

1. Open **https://home.example.be** and sign in. (Optional but nicer: browser menu → *Install app* / *Add to Home
   screen*; it then opens like an app. Push works in the browser too.)
2. **Settings → Notifications → Turn on notifications** → *Allow*.
3. Tap **Send a test notification**: it arrives within seconds.
4. Blocked by mistake? Tap the lock next to the address → *Permissions* → *Notifications* → *Allow* (installed app:
   long-press the icon → *App info* → *Notifications*), then come back and turn it on.

### iPhone and iPad (iOS / iPadOS 16.4 or newer)

Apple only allows web push for apps added to the home screen; in a Safari tab the button isn't there (Settings
shows these steps instead).

1. Open **https://home.example.be** in **Safari** and sign in.
2. Tap **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
3. Open **WickedHome from the new home screen icon** (not Safari) and sign in again if asked.
4. **Settings → Notifications → Turn on notifications** → *Allow*.
5. **Send a test notification**. Later changes: iPhone *Settings → Notifications → WickedHome*.

### Computers

Chrome, Edge, Firefox and Safari (macOS 13+) work while the browser runs: the same button in Settings.

Each device is listed under **Your devices** (with the last delivery and failures) and can be removed there.
The plain LAN address (http://192.168.1.10:3101) can't do push: browsers only allow it over HTTPS.

## No setup for the owner: the server's key

Push services only accept messages signed with the server's VAPID key pair; phones subscribe against its public key.

- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in `.env` win (base64url, as `npx web-push generate-vapid-keys` prints them).
  `VAPID_SUBJECT` (a `mailto:` or https URL; default `https://home.example.be`) is the contact push services see.
- Otherwise the app **generates a pair on first use** and keeps it in `web_push_keys` (one row). The private key is
  **encrypted with `INTEGRATIONS_KEY`** (`src/api/lib/secrets.ts`) when that is set; without it, it is stored plain
  and Settings → Notifications shows owners a note. A plain key is encrypted automatically once `INTEGRATIONS_KEY`
  appears. The private key never reaches the browser or the logs.
- Changing the key (or `INTEGRATIONS_KEY` so the stored one can't be read) makes every subscription useless: the app
  then starts with a new pair and people turn notifications on again on each device.
- dev (`wickedhome_dev`) and prod have their own databases, so their own keys and subscriptions.

## Sending one (for features)

```ts
// src/api/<feature>/<feature>.notifications.ts, imported by the feature's routes (or service)
import { registerNotificationKind } from "../notifications/notification-kinds";
import { notify } from "../notifications/notify";

registerNotificationKind({
  id: "waste.bins", group: "household",
  titleKey: "waste:notifications.bins.title", descriptionKey: "waste:notifications.bins.description",
  times: ["task", "18:00", "19:00", "20:00", "21:00"], defaultTime: "task",   // optional: a time people choose
  // urgent: true          bypasses quiet hours, Urgency: high (the alarm)
  // bypassQuietHours: true  pushed during quiet hours too, without alarm styling (a reminder the person timed)
  // defaultEnabled: false | ["owner"]      off by default / on only for some roles
  // roles: ["owner"]      who can get it at all
  // scoped: true          only for the things a person follows ("Notify me": device:<id>, profile:<id>)
});

await notify({
  householdId,
  kind: "waste.bins",
  habitantIds: assignees, fallbackToHousehold: true,     // or userIds, roles, excludeUserIds; none = everyone
  content: (locale) => (locale === "nl" ? { title: "Vanavond buitenzetten: Pmd", body: "…" } : { title: "Put out tonight: Pmd", body: "…" }),
  url: `/tasks/${taskId}`,
  tag: `waste:${date}`,              // one per person within dedupeMinutes (default 12 h), and one on the phone
});
```

- **One way**: features import `src/api/notifications`; notifications never imports a feature. Kind labels live in
  the feature's locales (`<feature>:notifications.<kind>.title/description`), so Settings lists kinds it doesn't know.
- Texts are built per recipient in their language (`users.locale`); `notification-text.ts` formats money and dates
  the Belgian way (€ 52,30, wo 7 okt). Keep titles short (phones show about two lines).
- From a request handler use `notifyInBackground()` (never delays or fails the response).
- **Scheduled** kinds register a notifier: `registerScheduledNotifier({ id, run({ now }) })`. The job
  `notifications.dispatch` runs them every 5 minutes; a notifier keeps the people whose chosen time has come
  (`recipientsWithTime` + `isTimeDue`, 3 hours of grace after a missed run) and relies on the tag de-dupe, so running
  twice sends nothing twice.

### Delivery rules (`notification-policy.ts`, tested)

1. The kind must allow the person's role and be on for them (their choice, else the kind's default for their role).
2. Scoped kinds only reach people whose scope contains one of the event's scope ids.
3. Same tag for that person within the window → skipped.
4. Stored (the center, the bell over SSE `notification.changed`).
5. **Quiet hours** (per person, default 22:00–07:00, Europe/Brussels): the push waits (`pushHeldUntil`) until they end;
   the dispatch job then pushes it if it's still unread and younger than 18 hours. **Urgent** kinds push right away.
6. Pushed to every device of the person: 404/410 from the push service deletes the subscription; other failures count
   up (`failureCount`, shown in the device list) and reset on the next success. The server only sends to known push
   service hosts over https.

## What is sent

| Kind | From | When | To | Default |
|---|---|---|---|---|
| `waste.bins` "Put out tonight: Papier & karton + Pmd" | `waste.notifications.ts` (scheduled) | at the bins task's time (20:00 the evening before or 07:00 that morning), or an evening hour the person picks | the task's assignees, else everyone | on |
| `tasks.digest` "Today: 3 tasks (1 overdue)" | `task-notifications.ts` (scheduled) | 08:00 (07:00–09:00 to choose): one message with what is overdue / due today for you and nobody's tasks | everyone with something | on |
| `tasks.reminder` "Reminder: Put the bins out" · "Today at 21:00 · in 15 min" | job `tasks.reminders` (every minute, `task-reminders.ts`) | at the task's reminder (due time, or N minutes before), high priority, **also in quiet hours** (the person chose the moment); < 30 min late after downtime: sent late, older: skipped | the people on duty, else the task's creator, else everyone | on |
| `tasks.assigned` "Assigned to you: …" | tasks routes (create/edit) | at once | newly assigned people, not who did it | on |
| `tasks.unblocked` "Can start now: …" | closing a task (`closeTaskOccurrence`) | at once | the waiting task's assignees, else the adults | on |
| `tasks.payments` "Pay tomorrow: Watergroep · € 52,30" / "Still to pay: …" | `task-notifications.ts` (scheduled) | 09:00 (to choose) the day before the pay task is due; overdue ones every 3 days for 2 weeks; not while on hold | the payer / sharers, else owners and adults | on |
| `expenses.auto-paid` "Paid by direct debit: € 134,90" | `expenses.auto-pay` job | after it marked direct debits paid | owners and adults | **off** |
| `income.vouchers` "Meal vouchers expire soon: € 23,40" | `income.notifications.ts` (scheduled) | 7 days before, and the last day | the voucher's owner, else owners and adults | on |
| `alarm.triggered` "Alarm! The alarm went off" | `ha-notifications.ts` (HA `state_changed`) | at once, **urgent** (also in quiet hours, stays on screen) | everyone | on |
| `alarm.armed` "Alarm armed (away)" / "Alarm disarmed" | same | at once, with who did it when done in WickedHome | everyone who turns it on | owners |
| `home-assistant.connection` "Home Assistant is unreachable" / "… is back" | scheduled check | after 15 minutes offline, and when it's back | owners | on |
| `devices.indicator` "Window bedroom: Open" | `setDeviceValue` (manual or Home Assistant) | the indicator turns orange or red; once per 30 min per device and colour | people who follow that device ("Notify me" on its page) or profile | opt-in |
| `integrations.mail-bills` "2 bills found in your mail" | Gmail scan | when it found new suggestions | owners and adults | on |
| `auth.invite-accepted` "Clara joined WickedHome" | accepting an invite | at once | who made the invite, else owners/adults | on |

Weather warnings are not sent (no cheap warning source in the current weather integration).

## API (`/api/notifications`, everyone, only their own)

`GET /` (`?cursor&limit`) → `{ items, unread, nextCursor }` · `GET /unread-count` · `POST /read { ids? }` (none = all)
· `GET /settings` → preferences, kinds for your role, devices, public key, key storage (owners) · `PUT /preferences
{ quietHours?, kinds? }` (merged) · `POST /scope { kind, scopeId, on }` · `POST /devices { endpoint, keys }` ·
`DELETE /devices/:id` · `POST /test` (10 per 10 minutes).

## Service worker (`public/sw.js`)

`push` shows the notification (title, body, `/brand/icon-192.png`, monochrome `/brand/badge-96.png` for Android's
status bar, `tag` so a newer one replaces an older one, urgent ones stay until tapped) and sets the app icon badge to
the unread count. `notificationclick` focuses a WickedHome window already on that page, else navigates an open one,
else opens a new one. `pushsubscriptionchange` re-registers a renewed subscription. Bump `VERSION` when changing it.
The badge is drawn by `npx tsx scripts/make-notification-badge.ts`.

## Tests and checks

- `src/api/notifications/notifications.test.ts` (`npm test`): quiet hours incl. midnight and DST, the urgent bypass,
  preference filtering (roles, defaults, scopes, times), de-dupe by tag, subscription cleanup on 404/410, the push
  request (VAPID JWT verified with the public key, payload decrypted as a browser does), the task digest, bins timing,
  voucher reminders, alarm transitions.
- `npx tsx scripts/notifications-runtime-check.ts`: on a throwaway copy of the dev database with a fake push service:
  key generation (encrypted), subscribe, test notification (headers + decrypted payload), 410 cleanup, the bins, digest
  and payment notifiers with a chosen clock, alarm in quiet hours vs a held one delivered later, de-dupe on a second
  run, unread count, mark all read with its live event, removing a device. The copy is dropped afterwards.

## Known gaps

- Pushes go to Google/Apple/Mozilla's push services (that is how web push works); payloads are encrypted end to end,
  but those services see that a message was sent, its size and urgency.
- iPhone: only the home screen app, iOS 16.4+; iOS may hold back pushes in Low Power or Focus modes.
- Device indicator tones are remembered in memory: the first value after a restart only sets the baseline, and
  staleness alone (no new value) doesn't notify.
- Home Assistant offline is detected by the 5-minute job, so it is told after 15–20 minutes.
- No per-device kind settings (a kind is on for all of a person's devices), no snooze or actions in the notification
  itself, no e-mail fallback, no weather warnings.
