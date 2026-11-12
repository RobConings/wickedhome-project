# ChatGPT subscription provider and the chat workspace

The existing WickedHome assistant supports `local` (the configured OpenAI-compatible server) and
`chatgpt_subscription` (official ChatGPT plan sharing). Both use the same conversation store, routing,
function registry, role checks, editable confirmations and audit path. The personal provider choice is
per WickedHome user. Existing background model consumers retain their configured local model.

## Self-hosted sign-in

Reviewed against the official OpenAI documentation on 12 November 2026:

- [Quickstart](https://developers.openai.com/siwc/quickstart)
- [Open-source plan sharing](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)

The open-source callback is HTTP on **127.0.0.1**, with `/auth/callback` and a per-attempt available port.
A phone's loopback cannot reach the home server. The separate website flow is an identity integration
for approved clients; it does not establish a general web callback for open-source subscription sharing.
WickedHome therefore implements desktop-assisted OAuth followed by protected credential transfer, as
in the self-hosted VM procedure. It does not run OAuth in the phone's browser.

1. Configure a valid existing `INTEGRATIONS_KEY` on the home server. Generate a new key only if none
   exists: `openssl rand -base64 32`. Do not replace a key already protecting Google or other integrations.
   Set `PUBLIC_URL` to your actual HTTPS origin and restart the server.
2. On the desktop that has a browser, check out WickedHome and run `npm ci`. Node 20.19 or later is needed.
3. In WickedHome, open **Settings → AI assistant** (`/settings?section=assistant`), then
   **Continue with ChatGPT**. The UI displays a one-time pairing command, valid for ten minutes.
4. Run that exact command in the desktop checkout. It opens the system browser after starting its local
   callback listener. Choose the intended ChatGPT account/workspace and explicitly approve plan usage.
5. Return to WickedHome, choose **Paired, load models**, and select an account-provided model under
   **ChatGPT subscription**. Connecting alone deliberately does not change the inference provider.

No ChatGPT API key, Codex credential file, website cookie or private backend endpoint is used.
The pairing command contains a short-lived credential-transfer secret; do not share it. Transfer is an
HTTPS POST directly from the desktop helper to the selected WickedHome server. HTTP is accepted only for
loopback development. The helper verifies OAuth state, issued client ID, PKCE and signed ID-token claims;
the server independently verifies the signature, issuer, audience, expiry and pairing nonce before import.
The one-time transfer is tied to the authenticated WickedHome user who created it. A restart expires pending
pairings. It is intentionally a single-process deployment, matching the existing assistant-run architecture.

OAuth requests include `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`,
`resource=https://api.openai.com/v1`, and S256 PKCE. First registration uses `dynamic_agent_client`;
subsequent pairing reuses the saved issued ID and checks the original verified subject. For explicit
re-consent after a declined plan grant, append `--consent` to the pairing command. This uses the documented
OAuth `prompt=consent`, not an inference-body prompt field. Separate registrations remain separately
labelled, even if their emails match. Use **Connect another account** for a new registration. Select a saved
account, then choose its model to activate it.

The desktop keeps only its stable host identifier, not the tokens. The server has a separate stable VM
host identifier which import never overwrites. The server owns all subsequent refreshes. Account records
are AES-256-GCM encrypted with user-bound associated data in `data/assistant-private/` (relative to the
parent of `STORAGE_DIR`). Files are atomically replaced with mode 0600; the directory is mode 0700.
Back up both protected files and the existing encryption key. Keep this directory outside a public file
server. The app serves neither raw credentials nor raw registration files to browsers or AI tools.

Refreshes are serialized per person. Permanent refresh failures clear unusable tokens while retaining the
registration; temporary network and infrastructure failures preserve them. Disconnect stops active runs,
attempts remote revocation with bounded retries, and removes local tokens. If remote revocation could not
be confirmed, the UI directs the person to ChatGPT settings. It never silently changes to local inference.

## Inference and history

The server discovers visible models from the authenticated account's `GET /v1/models` catalog. It does
not ship a hardcoded subscription model. Models are rechecked before new chat requests. The adapter posts
to `https://api.openai.com/v1/responses` with `store:false`, `stream:true`, instructions and explicit history.
Function definitions are grouped in the `wickedhome` namespace. Function calls execute through the existing
registry, including all confirmations and audits. No hosted tool, previous response ID, temperature,
Chat Completions-only options or unsupported output limit is sent.

Only `response.completed` completes inference. Failed, incomplete and interrupted responses have separate
errors. A late usage-limit failure still fails the turn after any partial text. Diagnostics retain HTTP
status, structured code, parameter, response shape and request ID without logging tokens or household input.
The UI links to account settings or [ChatGPT Usage](https://chatgpt.com/settings/usage) as appropriate.
Capability restrictions are surfaced, not retried with the same body or billed to another provider.

WickedHome continues to own conversation persistence, images, tool results and prompt budgeting. Refresh
restores saved conversation messages. Closing a chat detaches its watcher; Stop cancels the server run.
Copy and edit/resend are available on messages. Resending an edit appends a new user turn: it preserves
prior actions and audit history and does not rewrite completed household operations.

## UI and structured responses

The quick assistant sheet expands in place, retaining the current composer, attachments and stream.
Desktop expansion adds conversation history; phones open history within the same sheet. Closing restores
the original screen and Radix focus handling. The dedicated assistant screen also has a collapsible history
sidebar and history search. Both use the visual viewport height for mobile keyboards and safe-area padding.
Search covers conversation titles and user/assistant message text, scoped to the signed-in person.
A person reading older messages is not dragged to the bottom by every token.

Markdown is rendered with raw HTML disabled, safe links, GFM tables, highlighted code and copy controls.
Long answers can collapse. Model reasoning events are ignored. Structured tool results use the version-1
Zod contract in `src/features/assistant/types/response-components.ts`. Its closed registry supports summaries,
products, recipes, tables, charts, tasks, calendar, inventory, shopping, selections, dates/times, progress,
links and recovery cards. Unknown versions/types and unsafe URLs are rejected. Features supply trusted
`present` mappers. Their validated presentation is persisted alongside the original tool result in the
existing JSON column and streamed as `structured_response`; no database migration is required. Presentation
failure cannot turn an already-completed domain write into a failure. Interactive choices send a new user
message, which still goes through existing authorization and confirmation. `app.ask` can request a choice
or date; it grants no permission to mutate data.

## Verification boundary

`npm run typecheck`, `npm run lint`, production/Storybook builds, automated provider/loop tests and
`scripts/assistant-browser-smoke.mjs` cover the implementation without real account credentials.
Run the browser smoke after `npm run build-storybook`. It checks EN/NL, light/dark and 320/390/1440 widths,
plus expansion, retained drafts, safe Markdown and the pairing interface. The script writes screenshots
and a report under `/tmp/wickedhome-assistant-ui` by default.

The sign-in button uses the official [ChatGPT logo asset](https://developers.openai.com/assets/siwc/sign-in-buttons/chatgpt-logo-white.svg). Plan use and usage management remain visible near the selector; the first-use explanation is dismissible and remembered server-side.

A real OAuth grant, account eligibility, live model catalog, real inference and OpenAI-side revocation
require the account holder to complete pairing. These cannot be certified by mocked provider tests.
