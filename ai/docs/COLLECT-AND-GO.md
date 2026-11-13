# Collect&Go online ordering assistant

Collect&Go is the online ordering channel, including orders collected at a pickup point. Xtra/Colruyt
is the shopping list for buying products yourself in a physical store. They belong to the same retail
group but use separate lists/baskets, connections, account selections and channel-specific prices and
promotions. An Xtra list is not an online basket. Do not transfer items unless explicitly requested
and confirmed; if the intended channel is unclear, ask before changing either destination.

The Shopping skill adds `shopping_collectandgo_cart`, `shopping_collectandgo_orders`,
`shopping_collectandgo_order`, `shopping_collectandgo_search` and `shopping_collectandgo_basket` to the existing
assistant/MCP registry. It reuses existing role checks, mandatory sensitive-action confirmation, progress,
audit and typed response rendering. This integration does not create a separate shopping list, purchase
ledger or assistant. It prepares an external basket; completing the order remains on Collect&Go.

## Shopping page tabs and presence labels

The shopping page has separate **WickedHome**, **Xtra / Colruyt**, and **Collect&Go** destination tabs,
preserved by `?retailer=xtra` / `?retailer=collectandgo`. The Xtra panel is inside its own tab, rather
than above household needs. The Collect&Go tab shows the pending basket and placed reservations in
separate shared cards, with product quantities, unit prices, pickup windows and editing cutoffs.
Reservation contents load on selection; upcoming pickups are selected ahead of past orders.

The saved session is reused on page entry, visible-only polling, focus and connection events. No HAR
import is required on each visit. True retailer sign-in expiry or browser verification may eventually
require an owner to reconnect; imported browser credentials do not provide permanent authentication.
Do not present a response-format error as evidence that the session expired. Older browser-only
imports missing API credentials receive a distinct, one-time upgrade message.

Collect&Go omits `orderItem` on an empty basket. Accept the omission only with the signed-in account
marker, pending-cart identity, EUR currency and explicit zero count/total/start metadata. A non-empty
response missing its products, a null products field or a guest response still fails verification.
This fixed a reproduced false reconnect prompt using the account holder's unchanged saved HAR.

WickedHome needs and Shop view rows distinguish **In Collect&Go basket**, **Reserved with Collect&Go**
and **In shopping session: …**, with real links to the corresponding workspace. Match retailer items
only by an unambiguous exact full name or a recorded Collect&Go URL/article identity. Native reservation
items retain the same validated product/article identifiers as the basket. Do not strip package sizes,
fuzzy-match products, assume in-store identifiers match online or infer quantity coverage.

GET `/api/shopping/collect-and-go/activity` uses the same household mutex, grants, revocation generation
and rate limit as other native reads. It independently reads basket/history and preloads up to five
upcoming reservations under a 45-second combined timeout. Successful reads survive unrelated format
failures; a partial flag exposes omitted/unreadable reservations. The client reuses this one snapshot
for labels, the online tab and linked session views, with visible-only polling at 30 seconds or slower.
Labels ignore invalid/future-skewed observations, snapshots older than 90 seconds, failed history reads,
revoked access, cancelled/unknown states and pickup windows that have ended.

Live observation after the amendment cutoff on 13 November 2026 showed the same upcoming reservation
changing from M to C while pickup was still the following day. **C is not evidence of collected goods**:
M/C reservations with a future pickup remain reserved even when `editState=closed`. A read-only live
check returned an empty pending basket, 32 reserved products and a reservation match for the person's
fries using the original unchanged HAR. No order, quantity, stock or purchase was changed.

Linked online sessions are live projections on the shopping sessions page, not new database visits.
They preserve retailer account selection and disappear on revoked access. A reservation link opens its
products, pickup slot and editing cutoff using the shared reservation component. Native sessions retain
their own purchase/receipt/payment workflow. Reading or displaying a linked reservation never closes a
local visit or records an acquisition.

GET `/api/shopping/sessions/coverage` supplies current-household ACTIVE native visits with outstanding
OPEN, nonremoved rows, independently of recent visit history. It selects only the references/quantities
needed for labels, returns at most 100 visits with an explicit partial flag, and creates no writes.
Assignments follow actual requirement references (including grouped needs) or exact catalogue product
identity; unrelated shared-stock variants are not silently interchangeable. Closed/deleted sessions,
skipped/removed/fully acquired rows and stale coverage do not add labels. The shopping loader refreshes
these read models through the existing shopping events and loader refresh cycle. No schema migration
or automatic retailer import into the household database is required.

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


## Placed reservations and editing deadlines

A current pending basket (`orderStatus=P`) is separate from already submitted reservations. An empty
basket never proves that no order exists. The upstream [xtra-mcp project](https://github.com/ddvlamin/xtra-mcp)
handles the Xtra in-store list, not Collect&Go reservations; these reads use Collect&Go's order service.

- `shopping_collectandgo_orders` / GET `/api/shopping/collect-and-go/orders`: placed reservation history,
  excluding pending baskets, with pickup windows, estimated EUR totals and amendment cutoffs.
- `shopping_collectandgo_order` (`orderId`) / GET `/api/shopping/collect-and-go/orders/:id`: one placed
  reservation and its product quantities and unit prices.

Both use the same imported cart API session and explicit household account grants, including selected
children. No additional login or browser flag is needed. Native order reads call fixed GET endpoints in
`ecomfoodb2c.eshop.wcsordersvcv2/v2/store/{storeId}/order/@history` and `order/{orderId}`
([HCL order reference](https://help.hcl-software.com/commerce/7.0.0/com.ibm.commerce.starterstores.doc/code/rsm_order_fep8.htm)).
They validate the provider's buyer ID against the single imported WC authentication account; order IDs
cannot choose arbitrary paths. Non-empty history verifies each returned buyer directly; empty history additionally verifies the
signed-in basket before it can be reported empty. Provider pagination is followed up to five 100-record pages, with explicit truncation;
wrong offsets, duplicate IDs, changing totals/order details and incomplete pages fail verification.
Email, phone, addresses, payment data and raw order fields never reach clients. Fresh access checks and
connection-generation fences prevent queued or in-flight reads from returning data after revocation.

The observed reservation API provides `x_isAmendable`, `locked`, `x_aortDate`/`x_aortTime` (amendment
cutoff), and separate `x_handoverDate`/`x_handoverTimeFrom`/`x_handoverTimeTo` (pickup). Convert these
strictly from **Europe/Brussels**, independently of server timezone. Invalid or ambiguous DST times
remain unknown. `editState=open` requires the observed M reservation status, an explicit true amendment
flag, an unlocked order and a strictly future cutoff. False flags, locks, completed orders or expired
cutoffs close the window; incomplete/unknown states never imply permission. Recheck the cutoff after
pagination, because it can pass during a read. These are timestamped observations, not write authorization.

The official [reservation-change instructions](https://www.collectandgo.be/nl/reservatie-wijzigen)
require finishing with "klaar met winkelen" to submit amendments. Some pickups have different cutoffs;
never compute a universal 24-hour deadline. Increasing a product quantity can reprice its existing
quantity too, and discounts may depend on pickup date. **Automated reservation amendments are not
implemented.** Use the returned order link to finish them in Collect&Go. Never route a request to add to
a placed reservation through the pending-basket write tool; it also stops at an explicit amendment-mode
message before touching product controls. Any future amendment workflow must name the order and
products, obtain human confirmation, freshly verify provider editability and pricing immediately before
writing, and independently verify submission. No edit-mode activation, submit, cancel, checkout or
quantity-change request was made while developing the order reader.

Live read-only verification on 13 November 2026 returned 59 placed reservations and all 32 products in
the upcoming reservation, with the same estimated total and cutoff shown by the account holder.
Only GET requests were used. Committed tests contain synthetic fixtures; the private HAR and captured
responses are local only. This verifies reads, not any automated amendment workflow.

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

## AntiBot handling and shared reads

On 13 November 2026, previously successful native reads later returned HTTP 405 HTML with title
`Colruyt | AntiBot`. This is a retailer challenge, not proof of expired credentials or an empty basket.
The reader recognizes bounded HTML challenge evidence (also on 200/403 responses), cancels the body,
and returns `collectandgo_challenge` without exposing page contents. A plain JSON 405 remains an
availability error. No challenge solver, browser fingerprint manipulation or bypass is attempted.

Activity reads are sequential to avoid bursts and stop at the first real login/challenge failure,
including failures while loading reservation products. A challenge persists `needsReconnect` with an
optional `reconnectReason=challenge`; existing encrypted connections remain readable. Subsequent
automatic reads stop before making retailer requests. The UI distinguishes AntiBot from sign-in expiry,
hides live coverage and points to normal-browser access and an explicit connection test.

Selected accounts share verified activity snapshots for at most 60 seconds per household, connection
revision and generation. Cache hits still recheck current grants; replacing a connection, changing
access or disconnecting invalidates the cache. Failed reads are not cached. This reduces duplicate
traffic across pages and household members; it does not guarantee retailer approval.

POST `/check` explicitly makes one native read with the saved session even while automatic access is
paused. Success clears the pause, records verification and notifies household clients; failure leaves
the pause in place. Ordinary GET/MCP reads cannot silently resume it. This permits a deliberate retry
after a person checks the normal website without forcing another HAR import. A new import is needed
only when authentication really must be renewed; even a new import may still face the retailer block.

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
