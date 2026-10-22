# Accounts

How the people of the household get a login, and how those logins are managed. Code: `src/api/auth`
(links, accounts, my account, cleanup job) and `src/features/auth` (contracts, rules, screens, sections).
Data: `prisma/schema/auth.prisma` (`User`, `Session`, `Invite`).

A **habitant** is a person (or pet) of the household; a **user** is a login that belongs to one habitant.
Removing a login never removes the habitant or their history (tasks, bills, calendar…).

## Roles

| | Owner | Adult | Child |
|---|---|---|---|
| Sees Settings → Accounts | yes | yes | no |
| Invites | owners, adults, children | adults, children | nobody |
| Changes roles | any role | adults ↔ children | — |
| Disable, sign out everywhere, reset link, remove | anyone | adults and children | — |
| Settings → My account | yes | yes | yes |

- Only owners create owners, and adults can't change anything about an owner (or an owner invite).
- There is always at least one **active** (not disabled) owner: the last owner can't step down, be disabled
  or be removed. With two owners, either may step down.
- You can't disable yourself, or make a reset link for yourself (use My account → Password).
- The rules are pure functions in `src/features/auth/types/account-rules.ts`, used by the API (in a
  serializable transaction, so two owners can't demote each other at the same moment) and by the UI (to
  only offer what will work). Tests: `account-rules.test.ts`.

## Inviting someone (e.g. Clara)

1. Settings → Accounts → **Invite someone**.
2. Pick a habitant without an account, or **Someone new…** (name, type, colour: the habitant is created
   right away). Pick the role.
3. **Make link**. The dialog shows a QR code, the link with **Copy**, and on phones **Share…** (WhatsApp,
   Messages…). The link is shown this once; the list then shows the invite as *Invited*. In the same
   session "Show link again" works; otherwise use **Make new link** (the old link stops working).
4. Clara opens the link (scan the QR code with her phone camera, or tap it in WhatsApp). The page shows
   the household, her name and role. She enters her email, a password (at least 10 characters, twice) and
   her language, and lands logged in on the dashboard.

The link is built in the browser from `window.location.origin`, so a link made on
`https://home.example.be` points there and one made on `http://192.168.1.10:3101` points to the LAN. For
phones outside the home network, make the link on the public address. (Copy and Share need HTTPS; on the
plain-http LAN address the link can still be selected and copied by hand.)

- An invite is valid for **7 days** and works **once**. A new invite for the same habitant revokes the
  open one: one open invite per person.
- Pets can't get an account. Guests can.
- If someone is already logged in on the device that opens the link, the page says so and offers
  **Log out first**.
- Expired, used or revoked links say so, and who to ask: "Ask Rob for a new link".

## Password reset

Settings → Accounts → ⋮ → **Password reset link** (same mechanism, kind `PASSWORD_RESET`). Valid for
**24 hours**, once. The person opens `/reset/<token>`, sets a new password, is signed out on every device
and logged in on this one. A new reset link replaces the open one; disabling the account or changing the
password spends it. There is no "forgot password" email: someone of the household makes the link.

## Managing accounts

Settings → Accounts lists every login (habitant avatar and name, email, role, last login, active devices,
active / disabled) and the pending invites. Per account:

- **Role** — see the table above.
- **Disable** — blocks login and ends every session at once. **Enable** reverses it.
- **Sign out everywhere** — ends every session; the password keeps working.
- **Password reset link** — see above.
- **Remove account** — deletes the login (sessions, favourites, recents go with it); the habitant stays and
  can be invited again. Removing yourself isn't offered in the UI.
- Pending invites: **Show link again** (same session only), **Make new link**, **Revoke invite**.

## My account

Settings → My account (also in the account menu), for everyone:

- **Email** — confirmed with the current password.
- **Password** — needs the current password; every other device is signed out, this one stays.
- **Language** — saved on the account (the same setting as the account menu).
- **Devices** — where you're logged in (browser and system, last active), with **Sign out other devices**.

## Security

- **Tokens.** 32 random bytes (base64url, 43 characters), only ever in the link. The database stores the
  SHA-256 (`invites.tokenHash`), like session cookies (`sessions.id`). A database leak gives no usable
  links.
- **No tokens in API URLs or logs.** The page is `/invite/<token>`, but the API calls carry the token in a
  POST body (`/api/auth/links/lookup`, `/accept-invite`, `/reset-password`), and nothing logs it. The page
  load itself does appear in the nginx access log; the token there is single-use, short-lived and useless
  once used.
- **Rate limits (per IP, 15 minutes, in memory).** Opening a link: 30. Using a link: 10. Login: 10 per
  IP + email (unchanged). Checking the current password under My account: 10 per user.
- **Same answer for bad tokens.** Unknown, malformed and wrong-kind tokens all get the same 404. A known
  but unusable link only returns why (expired / used / revoked) and the inviter's first name, never the
  household or the person.
- **Using a link** happens in one transaction that marks it used only if it is still open, so a link can't
  be used twice at the same moment. Accepting while logged in is refused (409) so sessions never mix.
- **Disabled accounts** have no sessions left, and the session check refuses them anyway. The login says
  "disabled" only after a correct password, so it reveals nothing to someone guessing.
- **CSRF**: every mutation carries the `X-WickedHome` header, as everywhere in the API; the session cookie
  is `HttpOnly`, `SameSite=Strict`.
- **Enumeration**: the only places that tell whether an email exists are behind a valid invite link or a
  session (accepting an invite, changing your email).

## Activity log

Role changes, disabling and enabling, signing out everywhere, reset links, removals and invites (made,
revoked, accepted) are recorded in the household audit log with who did it (Settings → Activity, owners and
adults). Never the link or its token. See [AUDIT.md](AUDIT.md).

## Housekeeping

The job `auth.cleanup` (daily 03:20, Settings → Automations) deletes expired sessions and expired invite /
reset links (used and revoked ones included, once past their expiry). Until then, used links still answer
"already used" instead of "doesn't work".

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/links/lookup` `{token}` | public, rate-limited |
| POST | `/api/auth/links/accept-invite` `{token, email, password, locale}` | public, rate-limited |
| POST | `/api/auth/links/reset-password` `{token, password}` | public, rate-limited |
| GET | `/api/auth/accounts` | owner, adult |
| POST / DELETE | `/api/auth/accounts/invites`, `/invites/:id` | owner, adult |
| PUT | `/api/auth/accounts/:id/role` | owner, adult |
| POST | `/api/auth/accounts/:id/disable`, `/enable`, `/sign-out`, `/reset-link` | owner, adult |
| DELETE | `/api/auth/accounts/:id` | owner, adult |
| GET | `/api/auth/me/account` | everyone |
| PUT | `/api/auth/me/email`, `/api/auth/me/password` | everyone |
| POST | `/api/auth/me/sign-out-others` | everyone |
