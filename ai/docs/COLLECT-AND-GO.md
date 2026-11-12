# Collect&Go shopping assistant

The Shopping skill adds `shopping_collectandgo_search` and `shopping_collectandgo_basket` to the existing
assistant/MCP registry. It reuses existing role checks, mandatory sensitive-action confirmation, progress,
audit and typed response rendering. This integration does not create a separate shopping list, purchase
ledger or assistant. It prepares an external basket; completing the order remains on Collect&Go.

## Browser connection

Collect&Go has a separate personal browser session; importing a shared Xtra/Colruyt connection does
not automatically authenticate a Collect&Go basket. Settings → Collect&Go now uses normal-browser
import, without asking household users to run a login helper or server import command:

1. In normal Chrome, sign in at Collect&Go and choose your pickup point.
2. Open DevTools → Network, select Doc, filter for `collectandgo.be/nl/`, clear the log and reload the
   signed-in shop page. Use a successful (200) page request.
3. In DevTools Settings → Preferences → Network enable HAR export with sensitive data. Copy the
   filtered requests with **Copy all listed as HAR (with sensitive data)**.
4. Paste only into Settings → Collect&Go and click **Import browser session**. Alternatively, upload
   an existing browser storage-state JSON file there. No raw archive is sent to the server.

The browser extracts only cookies observed on successful `https://www.collectandgo.be/nl/` HTML/JSON
requests and the recorded user agent. Cookie credentials are bound to that exact host; no cookie domain
or local-storage state is invented. Blocked/error pages, unrelated origins, sanitized cookie-free exports
and conflicting sessions are rejected. The normal-browser cookie import does not include local storage,
so some shop/pickup/account state may still require a complete storage-state file. An import is explicitly
labelled **unverified**: it cannot guarantee signed-in basket access or overcome a retailer block.

POST `/api/shopping/collect-and-go/session` requires the logged-in adult/owner, the app's normal CSRF
header and a configured integration encryption key. It saves only that person's encrypted session and
never opens a browser during import. Replacing/removing a session invalidates queued browser work.

Administrator setup remains on the server: `COLLECTANDGO_ENABLED=1`, a valid `INTEGRATIONS_KEY`, and an
installed Playwright Chromium (or `COLLECTANDGO_BROWSER_PATH`). Restart after configuration changes.
The existing `collectandgo:login` and `collectandgo:import` scripts remain optional legacy tools, not the
normal settings workflow. Login automation may be blocked even when regular Chrome works.


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
stops and points to the normal-browser import in Settings.

Pricing, URL allowlists, restriction matching and browser state transitions have deterministic tests.
Run persisted-page browser checks with:

```sh
DATABASE_URL=postgresql://test@localhost/test COLLECTANDGO_BROWSER_TESTS=1 npx tsx --test src/api/shopping/collect-and-go-browser.test.ts
```

These prove price-change refusal, persisted absolute quantities, retry behavior and challenge handling
against local browser fixtures; they are not certification that the live website accepts automation.

The normal-browser import and groceries-panel update passed 44 targeted service/contract/workflow tests,
three persisted-browser basket fixtures, and 24 English/Dutch mobile/desktop UI renders. The UI check
also verifies the absence of terminal commands, minimal import payload, automatic Xtra reads, live
updates, stale data and revocation during an in-flight read. Run it after `npm run build-storybook` with
`node scripts/groceries-retailer-browser-smoke.mjs`.
