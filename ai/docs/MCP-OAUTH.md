# MCP over OAuth (ChatGPT, Claude connectors)

The MCP server (`POST /api/mcp`, [ASSISTANT.md](ASSISTANT.md#mcp-server)) accepts two kinds of bearer token,
as equals:

| Way | Token | For |
|---|---|---|
| **Personal token** | `wh_mcp_…`, made on the Assistant card, pasted into the client | Claude Desktop, LM Studio, Cursor, scripts: clients where you paste a header |
| **OAuth automatic (DCR)** | `wh_at_…` access + `wh_rt_…` refresh, issued after you allow the app | ChatGPT and Claude custom connectors: they register themselves |
| **OAuth app (manual)** | the same OAuth tokens | a connector that asks for a client ID (and secret) instead of registering |

Personal tokens are unchanged by OAuth: switching automatic registration off, or deleting OAuth apps, never
touches them. Both kinds act as one person, with that person's tools and household, and the same scopes:
**read** lists and calls only read tools; **write** also gets write tools, each needing `confirm: true`
after the human agreed in their own client. Every write is in the audit log (channel `mcp`); OAuth writes
show the app's name next to the person ("Rob · ChatGPT").

**Data shared with ChatGPT goes to OpenAI** (and with Claude to Anthropic): whatever a tool returns to the
connector is processed under that service's terms. Give read-only access unless you want the assistant to
change things.

## Connect ChatGPT

1. In ChatGPT: Settings → Apps & Connectors → Advanced → developer mode on, then **Create** (add custom MCP
   server). The exact menu names change over time.
2. **Server URL** `https://home.example.be/api/mcp`, **Authentication** OAuth. With registration
   **automatic (DCR)** ChatGPT registers itself; nothing else to fill in. (Or: Assistant card → MCP → *OAuth
   app* → make one with ChatGPT's callback URL, `https://chatgpt.com/connector/oauth/<id>` as shown in the
   dialog, and paste the client ID, plus the secret if you made one.)
3. ChatGPT opens WickedHome: sign in if needed, check **"Tokens go to chatgpt.com"**, choose *Read only* or
   *Read and change*, **Allow**. ChatGPT is now connected; it shows under *Connected apps* on the card.

## Connect Claude

Claude (claude.ai, desktop and mobile): Settings → Connectors → *Add custom connector*, URL
`https://home.example.be/api/mcp`. Claude registers itself (DCR), opens the consent page, done. Claude
Desktop can also use a personal token in its config file instead (ASSISTANT.md).

## The Assistant card

Assistant card → *Connect other assistants (MCP)*: a choice between the three ways, each with a line on when
to use it.

- **Personal token**: the existing token panel.
- **OAuth automatic**: the instructions; owners also switch DCR on/off and edit the **allowed domains**
  (default `chatgpt.com`, `claude.ai`).
- **OAuth app**: owners make an app (name, redirect URIs, optionally a client secret) and see the client ID and
  secret once; delete it to cut everyone connected through it off.
- **Connected apps** (always shown): app, the domain its tokens go to, access, person, last used
  (dd/mm/yyyy HH:mm), and *Disconnect*. Owners see the household's connections, others their own.

## Security model

- **Discovery**: `GET /.well-known/oauth-protected-resource` (also `…/oauth-protected-resource/api/mcp`, RFC 9728)
  names the resource `https://home.example.be/api/mcp` and the authorization server; `GET
  /.well-known/oauth-authorization-server` (RFC 8414) the endpoints. A 401 from `/api/mcp` carries
  `WWW-Authenticate: Bearer realm="wickedhome-mcp", resource_metadata="…/.well-known/oauth-protected-resource"`.
  Other `/.well-known/*` paths are a JSON 404 (this is not an OpenID provider). URLs come from `PUBLIC_URL`
  (default `https://home.example.be`).
- **Dynamic registration** (`POST /oauth/register`, RFC 7591): only `https` redirect URIs on an exact
  allow-listed host, default port, no user info or fragment; anything else is `invalid_redirect_uri`.
  Rate-limited (10 per IP and 100 in total per hour). The default auth method (RFC 7591) is
  `client_secret_basic`, so a client that doesn't ask for `none` gets a secret. Off (owner switch): the
  endpoint answers 404 and isn't advertised; registered clients keep working. A dynamic client may only keep
  using a redirect host that is *still* allowed: removing a domain stops its clients at once.
- **Manual apps** belong to the owner's household; any `https` redirect URI; a secret is optional (stored as
  SHA-256, shown once). People of another household get "expired" for its requests.
- **Authorize** (`GET /oauth/authorize`): an unknown `client_id` or a `redirect_uri` that doesn't exactly
  match a registered one gets an error *page*, never a redirect. Otherwise errors go back to the client
  (`error`, `state`, `iss`): `response_type=code` only, `code_challenge` required with method `S256` (plain
  is refused), `resource` must be the MCP endpoint (`invalid_target`; left out it defaults to it, the only
  resource there is), scopes `read`/`write`. A valid request is stored (10 minutes) and the browser goes to
  the consent page `/connect/<random id>`.
- **Consent** (`/connect/:id`, an app page outside the app frame, EN/NL, phone first): signs in through the
  normal login first. Shows the app's name, **the real redirect host prominently** ("Tokens go to
  chatgpt.com": the name is the client's own claim, the host is what counts), a warning to allow only a
  connection you started yourself, and *Read only* / *Read and change* (only what was requested). Children
  are refused outright (and their tokens, if a role changes later, stop working). The first person to open
  the request owns it; the decision needs the page's CSRF token (renewed on every load, stored hashed), the
  `X-WickedHome` header and the SameSite=Strict session cookie. The page is never framed
  (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) and sends no referrer.
- **Code**: 32 random bytes, 60 seconds, single use, bound to client, redirect URI, PKCE challenge, person,
  household, scope and resource. Presenting it again revokes the grant made from it (and every token).
- **Token** (`POST /oauth/token`, RFC 6749 JSON errors, `Cache-Control: no-store`): confidential clients
  authenticate (`client_secret_basic` or `_post`); a public client sending a secret is refused. Access tokens
  last 1 hour; refresh tokens 30 days, **rotate on every use**, are bound to their client, and a used one
  coming back revokes the whole grant (reuse detection). A refresh may narrow `write` to `read`, never widen.
- **On `/api/mcp`** an OAuth token must be unexpired, not revoked, of a live grant whose audience is the MCP
  endpoint, of an enabled non-child account still in the grant's household. Then it is the same as a
  personal token of that scope.
- **Revoke**: `POST /oauth/revoke` (RFC 7009; a refresh token ends its grant, an access token itself),
  *Disconnect* on the card, deleting a manual app, or disabling the account.
- **Storage**: only SHA-256 hashes of codes, tokens and secrets (prisma/schema/mcp-oauth.prisma).
- **Cleanup** (`assistant.oauth-cleanup`, every 10 minutes): expired requests, codes (after a day, for replay
  detection), expired tokens, revoked grants, and dynamic clients unused for an hour without a live grant.
- Known limit: anyone can register a client with an allowed host (e.g. their own ChatGPT connector) and send
  you a link; the consent page's warning and host line are the defence, as with any OAuth server that allows
  dynamic registration. The DCR settings are server-wide (one household in practice); any owner changes them.

## nginx

Nothing to add: `location /` already proxies everything (including `/.well-known/` and `/oauth/`) to the app,
and Express serves them before the SPA fallback. Were a `/.well-known/` location ever added for other files,
proxy these paths to the app:

```nginx
location ~ ^/\.well-known/oauth-(protected-resource|authorization-server) {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## API

| Method | Path | |
|---|---|---|
| GET | `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/api/mcp` | RFC 9728 metadata (CORS) |
| GET | `/.well-known/oauth-authorization-server` | RFC 8414 metadata (`registration_endpoint` only while DCR is on) |
| POST | `/oauth/register` | RFC 7591 (404 while DCR is off) |
| GET | `/oauth/authorize` | → `/connect/<id>`, or an error back to the client / an error page |
| POST | `/oauth/token` | `authorization_code` (PKCE) / `refresh_token` |
| POST | `/oauth/revoke` | RFC 7009 |
| GET | `/api/assistant/oauth` | `{serverUrl, connected, settings, apps}` (settings and apps for owners, else `null`) |
| DELETE | `/api/assistant/oauth/connected/:id` | disconnect (owners: anyone in the household; others: their own) |
| PATCH | `/api/assistant/oauth/settings` `{dcrEnabled?, allowedHosts?}` | owners |
| POST / DELETE | `/api/assistant/oauth/apps`, `/apps/:id` `{name, redirectUris, confidential}` | owners; the secret only in the POST answer |
| GET / POST | `/api/assistant/oauth/requests/:id` `{decision, scope, csrf}` | the consent page → `{redirectTo}` |

## Code

`ai/core/mcp-oauth.ts` (the rules, over a store interface), `mcp-oauth.store.ts` (Prisma), `mcp-oauth.routes.ts`
(HTTP), `mcp-oauth.jobs.ts` (cleanup); contract `src/features/assistant/types/mcp-oauth.ts`; UI
`components/mcp-connections-panel.tsx`, `screens/mcp-consent-screen.tsx`, route `src/routes/connect.tsx`.

## Checks

- `ai/core/mcp-oauth.test.ts` (no database: in-memory store, fake clock, in-process Express): discovery, DCR
  allow-list and off, rate limit, authorize validation, consent (CSRF, children, households, single use,
  expiry), code replay and PKCE, confidential clients, refresh rotation and reuse, expiry and revocation on
  `/api/mcp`, read scope vs write tools, households never crossing, the card API, and a personal token with
  DCR on and off.
- `npx tsx ai/eval/assistant-runtime-check.ts` runs the whole flow on the real tables of a throwaway database.
