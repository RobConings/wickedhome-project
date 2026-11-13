# Collect&Go online ordering assistant

Collect&Go is the online ordering channel, including orders collected at a pickup point. Xtra/Colruyt
is the shopping list for buying products yourself in a physical store. They belong to the same retail
group but use separate lists/baskets, connections, account selections and channel-specific prices and
promotions. An Xtra list is not an online basket. Do not transfer items unless explicitly requested
and confirmed; if the intended channel is unclear, ask before changing either destination.

The Shopping skill adds `shopping_collectandgo_cart`, `shopping_collectandgo_search` and `shopping_collectandgo_basket` to the existing
assistant/MCP registry. It reuses existing role checks, mandatory sensitive-action confirmation, progress,
audit and typed response rendering. This integration does not create a separate shopping list, purchase
ledger or assistant. It prepares an external basket; completing the order remains on Collect&Go.

## Shared account connection

Collect&Go has a household-shared browser session with its own account selection; importing a shared
Xtra/Colruyt connection does not automatically authenticate a Collect&Go basket. Settings → Collect&Go now uses normal-browser
import, without asking household users to run a login helper or server import command:

1. In normal Chrome, sign in at Collect&Go and open your online basket.
2. In DevTools → Network filter on `wcscartsvcv2`, clear the log and reload the basket. Select the
   successful GET cart request (200), then export the filtered request as HAR with sensitive data.
3. An owner selects the permitted WickedHome accounts in Settings → Online · Collect&Go and imports it.
4. Click **Test connection / Verbinding testen** to read the signed-in basket and record verification.

The importer recognizes only the exact `apip.collectandgo.be` cart service. It extracts `WCAuthToken`,
`X-CG-APIKey`, the store/catalog/language identifiers and a small set of first-party session cookies.
It can also extract credentials from a successful captured add-to-cart POST (201), but **never replays
that POST or imports its body**. Unrelated tracking cookies, advertising requests, page content and
response bodies are discarded locally. Conflicting credentials and missing authentication cookies are
rejected. The raw HAR never goes to WickedHome's server and must never be committed or pasted into chat.
Legacy successful www.collectandgo.be page exports and full storage-state files remain importable;
those may need renewal using the cart API export for reliable basket reads. Import alone stays unverified.

POST `/api/shopping/collect-and-go/session` requires a household owner, the app's normal CSRF header,
a configured integration encryption key and an explicit `{ state, userIds }` body. PUT `/access` changes
only the grants, and DELETE `/session` disconnects the shared session for everyone. Selected children
can search/read; only selected adults/owners can change the basket, always after confirmation. Owners
do not automatically receive usage access: select their accounts too when desired.

The shared credentials and grants are encrypted with AES-256-GCM under a household-bound context in
`collect-and-go-shared/`, a sibling of `STORAGE_DIR`, with directory mode 0700 and files 0600. Every
browser operation and offer preview rechecks access; changing grants, replacing a session or disconnecting
cancels active/queued browser work. The browser serializes work per household so participants share one
retailer session safely. Observed offers remain per person and are bound to the connection revision.
Expired/challenged sessions are flagged for owner renewal; no client receives cookies or stored state.
Owner connection/access changes are recorded in the existing audit log.

Existing personal sessions are not automatically shared and are no longer a fallback for tool access.
If an owner has one, Settings offers **Share my saved session** after choosing the accounts. POST
`/session/adopt` copies that owner's session into the household store and removes their old personal file.
It cannot adopt someone else's personal session, and will not overwrite an existing shared connection.
The older CLI import remains a private staging step until an owner explicitly adopts the session.

Native cart reading needs a valid `INTEGRATIONS_KEY`, an explicitly imported cart API session and selected
account access. It does not require Chromium or `COLLECTANDGO_ENABLED=1`. The latter flag and an installed
Playwright Chromium (or `COLLECTANDGO_BROWSER_PATH`) still enable the separate browser search/write
functions and legacy browser fallback. Restart after environment configuration changes.
The existing `collectandgo:login` and `collectandgo:import` scripts remain optional legacy tools, not the
normal settings workflow. Login automation may be blocked even when regular Chrome works.


## Search, promotions and basket behavior

`shopping_collectandgo_cart` reads the signed-in online basket; Settings' **Test connection / Verbinding
testen** calls the same reader through `POST /api/shopping/collect-and-go/check`. Selected accounts,
including selected children, may read it. `GET /api/shopping/collect-and-go/cart` returns the same basket.
Both paths recheck household access, are rate-limited, and honour client cancellation. Verification
uses a fresh GET to the fixed cart API and persists only its timestamp in the encrypted connection.
The API is the observed wcscartsvcv2 service with the documented `cart/@self` read operation
([HCL cart reference](https://help.hcl-software.com/commerce/7.0.0/com.ibm.commerce.starterstores.doc/code/rsm_cart_fep8.htm)).
No request method, host, path or request body is taken verbatim from the HAR. Redirects are refused;
response size and time are bounded. Cookies are sent only to the fixed Collect&Go API host.

A successful read requires a pending cart, an account email marker, consistent pagination, positive
quantities and EUR prices. The email and other account/order details are discarded from tool output.
Malformed/guest/completed-order responses, authentication failures and bot challenges fail explicitly.
Missing unit prices remain unknown; a partial response is marked partial. Preparing or reading a cart
never submits an order, copies anything into Xtra, or updates WickedHome purchases or inventory.

The optional legacy browser fallback follows only an observed cart link, requires explicit sign-in and
cart-page evidence, and blocks all non-GET/HEAD/OPTIONS requests. Unknown layouts fail rather than being
reported as empty. These selectors are covered by fixtures; native API reading is the recommended path.

The native reader was independently checked against a locally supplied authenticated HAR: its GET
returned two cart products with prices. No captured POST, quantity change or order was submitted. The
raw HAR, tokens, personal details and captured response are excluded from committed fixtures. Tests use
synthetic data with the verified response shape. Verification can expire; failed checks clear the saved
verification marker, and a replacement import starts unverified.

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
serialized per household, and work has an overall timeout plus the assistant's Stop signal. A CAPTCHA,
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

The normal-browser import and groceries-panel update passed 54 targeted service/contract/workflow tests,
three persisted-browser basket fixtures, and 24 English/Dutch mobile/desktop UI renders. The UI check
also verifies the absence of terminal commands, minimal import payload, automatic Xtra reads, live
updates, stale data and revocation during an in-flight read. Run it after `npm run build-storybook` with
`node scripts/groceries-retailer-browser-smoke.mjs`.

The shared-connection tests additionally cover selected-account usage of the same saved browser state,
owner-only management, tenant isolation, revocation before browser launch, invalidating queued work and
old offers, child read-only access, shared reconnect state, explicit personal-session adoption and
household-wide disconnect. The full unit suite passed 1,754 tests with 61 skipped and the same two
pre-existing failures in receipt-upload and shared-stock-group-preview tests. No live account basket
was changed during these fixture checks.
