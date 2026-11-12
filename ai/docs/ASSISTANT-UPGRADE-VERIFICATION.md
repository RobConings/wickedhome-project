# Assistant upgrade verification — 12 November 2026

Implementation is in the local checkout, based on clean `main` at `a59c2e7`. Nothing was deployed.
No household database, real ChatGPT grant or real Collect&Go basket was modified during verification.

| Check | Result |
| --- | --- |
| TypeScript, including a separate CLI-script compilation | Pass |
| Repository ESLint | Pass |
| Production build with a placeholder DATABASE_URL, without connecting to a database | Pass |
| Storybook production build | Pass |
| New provider, OAuth/HTTP pairing, credential lifecycle, Responses loop, schema and pricing tests | 31 pass |
| Full repository suite | 1,704 pass; 61 skipped; 2 existing failures |
| Persisted-page Collect&Go browser fixtures | 3 pass |
| Assistant browser smoke | 60 EN/NL, light/dark, 320/390/1440 renders; interaction checks pass |
| Live Collect&Go public observation | Product tile markup observed; subsequent search challenged by CAPTCHA |

The two full-suite failures were reproduced in a separate, unchanged worktree at `a59c2e7`, using the same
installed dependencies. The temporary worktree was removed after verification:

- `src/api/shopping/receipt-upload.test.ts`: expected rejection of a malformed base64 PDF.
- `src/features/shopping/types/shared-stock-group-preview.test.ts`: direct linking of two ungrouped products.

Browser smoke includes expansion/collapse without losing a composer draft, mobile history navigation,
collapsible desktop history, a visible composer within the viewport, safe Markdown links/HTML handling,
syntax highlighting and the desktop pairing instructions. Screenshots and the JSON report are written to
`/tmp/wickedhome-assistant-ui` (override with `ASSISTANT_UI_OUTPUT`). This uses real application components
with fictional Storybook clients; it does not certify a physical phone keyboard or live provider access.

The HTTP pairing test signs an ID token with a test key, exercises one-time transfer, checks CSRF/session
boundaries and verifies that other users and status responses cannot read credentials. The Responses
adapter test continues through the existing sensitive-write confirmation boundary, so no write runs until
confirmed. Refresh tests cover rotation serialization, atomic encrypted storage, terminal revocation and
preserving credentials during temporary failures. Browser basket fixtures verify absolute saved quantities,
price-change refusal and explicit human-verification stops; they do not establish the live website's
current authenticated quantity controls.

## Remaining acceptance steps requiring the account holder

1. Configure/retain the server's integration encryption key and complete desktop ChatGPT pairing.
2. Choose an account-provided model; verify live text streaming, a household read, a confirmed write,
   token renewal and disconnect with that account.
3. Enable/install the Collect&Go browser, complete the desktop login and securely import the session.
4. Verify the selected pickup point, live product results and promotion conditions. Confirm a small basket
   quantity update and inspect it on Collect&Go. No automatic checkout is implemented.
5. Check keyboard opening, safe areas and focus restoration on the actual desktop/phone browsers used
   by the household.

Setup: [ChatGPT subscription](CHATGPT-SUBSCRIPTION.md), [Collect&Go](COLLECT-AND-GO.md).
