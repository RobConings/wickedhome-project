# Collect&Go shopping assistant

The Shopping skill adds `shopping_collectandgo_search` and `shopping_collectandgo_basket` to the existing
assistant/MCP registry. It reuses existing role checks, mandatory sensitive-action confirmation, progress,
audit and typed response rendering. This integration does not create a separate shopping list, purchase
ledger or assistant. It prepares an external basket; completing the order remains on Collect&Go.

## Setup

1. On the home server, set `COLLECTANDGO_ENABLED=1`, retain the existing `INTEGRATIONS_KEY`, and run
   `npx playwright install chromium` (Linux may also require Playwright's documented system dependencies).
   Restart WickedHome. An optional `COLLECTANDGO_BROWSER_PATH` selects an installed Chromium executable.
2. For public product discovery no account import is required, subject to the shop's human verification.
3. For personal pickup-point prices and basket access, run `npm run collectandgo:login` in a desktop
   WickedHome checkout, in a local terminal on your Mac/computer rather than an SSH session on the server.
   The helper uses an installed desktop Chrome when Playwright's own browser isn't installed.
   This opens a normal browser. Sign in yourself, complete any CAPTCHA, select the
   pickup point, then press Enter in the terminal. No password is sent to WickedHome.
4. The helper writes a new owner-only `~/.config/wickedhome/collect-and-go.json`. It refuses to overwrite
   an existing file. Keep it private. Only shop cookies/local storage are retained.
5. Transfer this file to the home server over SSH, retaining mode 0600, then run there:

   ```sh
   npm run collectandgo:import -- --user 'your@email.example' --file /protected/collect-and-go.json
   ```

6. Delete both plaintext transfer copies after successful import. The server stores a per-user encrypted
   session under `data/collect-and-go/`, relative to the parent of `STORAGE_DIR`. Review/remove it through
   **Settings → Collect&Go**. Removing it locally does not log out every session at Collect&Go.

## Search, promotions and basket behavior

Ask the assistant to find a named product, compare alternatives or check Collect&Go promotions.
The browser reads visible public product cards, including product identity, photos, base price, unit
price, conditions, observation time and price context. The adapter uses observed product links and DOM
controls, not private shopping endpoints. It caps the current rendered results and ranks lexical matches.
A current promotion search covers the displayed promotion page, not the entire store catalog.

Discount estimates use integer euro cents. Explicit single-product percentage thresholds, fixed per-piece
prices and simple buy-plus-free offers can be estimated. Mix-and-match, service-fee, loyalty and coupon
conditions remain visible text; they are not stacked into invented savings. Name ranking is not proof of
package size, dietary suitability or equivalent quantity. The person chooses the actual offer. Unknown
prices remain unknown. Estimates are not checkout totals or promises of eligibility on an eventual date.

Choose a product card and ask to prepare the basket. Each observed offer is short-lived and tied to the
WickedHome user. Before a write, the existing confirmation card shows identity, target final quantity,
price and conditions. The browser then rereads the exact product and refuses if price/promotion changed.
It uses the actual add control when necessary and an explicit quantity field, then reloads and verifies
the persisted absolute quantity. Repeating a successfully verified request sets the same quantity, rather
than blindly adding again. If any post-write check fails, the error says the basket may have changed and
asks the person to inspect it before retrying. Nothing is marked bought in WickedHome and no payment,
stock movement, order or pickup booking is created by this operation.

The browser accepts only fixed HTTPS company origins; model output cannot choose a browser destination.
It blocks other network origins, downloads and service workers. Browsers are short-lived, operations are
serialized per user, and work has an overall timeout plus the assistant's Stop signal. A CAPTCHA,
expired session, changed layout or unverifiable quantity is an explicit error. There is no CAPTCHA solving,
stealth fingerprinting, authentication bypass or automatic checkout.

## Verification boundary

Observed the public Collect&Go homepage/product tile markup on 12 November 2026. A subsequent live
search was challenged with a CAPTCHA. No signed-in basket or live order was modified during development.
The authenticated quantity controls therefore still need acceptance testing with the account holder's
session. A transferred session may also be challenged again by the shop. If that happens, the integration
stops and provides the desktop-helper recovery instructions.

Pricing, URL allowlists, restriction matching and browser state transitions have deterministic tests.
Run persisted-page browser checks with:

```sh
DATABASE_URL=postgresql://test@localhost/test COLLECTANDGO_BROWSER_TESTS=1 npx tsx --test src/api/shopping/collect-and-go-browser.test.ts
```

These prove price-change refusal, persisted absolute quantities, retry behavior and challenge handling
against local browser fixtures; they are not certification that the live website accepts automation.
