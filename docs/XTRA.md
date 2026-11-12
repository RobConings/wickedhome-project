# Shared Xtra / Colruyt connection

WickedHome owns a native TypeScript connector. The product form and the existing assistant/MCP registry
call the same shopping service. No Python MCP sidecar is installed.

An owner connects one Colruyt account for the household and explicitly selects the WickedHome accounts
allowed to use it in **Settings → Xtra · Colruyt** (`/settings?section=xtra`). Those people use the same
retailer account, selected store and shopping list on all their devices. Owners manage connection and
access; selected children may search/read, but only selected owners/adults may change the list.
An owner does not automatically receive usage access. This keeps the account picker authoritative.

## Connect using normal Chrome

Configure the existing `INTEGRATIONS_KEY` on the server (32 random bytes, base64). An owner then
connects the retailer account in **Settings → Xtra · Colruyt** and selects the permitted accounts.
Use your regular Chrome window if Colruyt blocks the automated desktop helper:

1. Sign in normally at Colruyt, choose your store and open Chrome Developer Tools (`⌥⌘I` on Mac).
2. In Network, filter for `latest-shopping-list`, clear the log and open/refresh your Colruyt list.
   Use only matching successful requests (HTTP 200).
3. In DevTools Settings → Preferences → Network enable **Allow to generate HAR with sensitive data**.
4. Right-click the matching request → Copy → **Copy all listed as HAR (with sensitive data)**.
5. In your own WickedHome Settings → Xtra, paste into **Copied browser connection data**, choose the
   permitted accounts and click **Verify and connect**. Never paste the export in chat or a terminal.

The HAR is parsed entirely in your browser; it is never executed or sent to the server. The paste field
immediately hides its contents. Only the minimal shop session/API header/store/user-agent fields go to
WickedHome's existing connection endpoint; response bodies, list contents and unrelated cookies are
discarded. Only the two known HTTPS Colruyt list/search endpoints, GET requests with status 200 and a
valid session are accepted. Mixed sessions/stores and sanitized exports without cookies are rejected.
The server must still verify retailer access before saving anything. A working ordinary browser does
not guarantee Colruyt will allow server-side requests. The import does not bypass a retailer block.

Chrome documents [network exports and the sensitive-data export option](https://developer.chrome.com/docs/devtools/network/reference#save-all-as-har).

### Alternative: desktop helper or an existing connection file

Install Chromium on the desktop if needed (`npx playwright install chromium`), or use installed Chrome.
In a local desktop terminal, run `npm run xtra:login` from its WickedHome checkout. Do not run it in an
SSH session on `home-server`: that server has no visible browser for login. Sign in yourself, complete
SMS/browser verification, choose your store, search and open the shopping list, then press Enter.
Optional `-- --browser /path/to/chrome` selects a browser, and `-- --output /protected/new-connection.json`
chooses a new export filename. The helper refuses to overwrite existing files.

The owner-only file defaults to `~/.config/wickedhome/xtra-connection.json`. In Settings, expand
**Alternative: desktop helper or existing connection file**, choose it, select the permitted accounts
and verify. The server reads the list before replacing any existing connection. Delete the plaintext
file after import. There is no server terminal import. If Colruyt blocks the helper, use the normal
browser method above; changing Node or installing a virtual display does not establish retailer access.

The helper exports only the shop's `clpbff_session`, optional browser-verification cookie, observed API
header, browser user agent and store ID. It never asks WickedHome to handle your Xtra password or SMS code. The server stores
the credentials, access list and operation journal encrypted with AES-256-GCM in a household-bound file
outside public document storage: a sibling `xtra-private/` directory of `STORAGE_DIR`, with directory
mode 0700 and files 0600. Back up this directory together with the integration key securely.

This is an unofficial integration with the Colruyt website's endpoints. The example project documents
the protocol but does not implement renewable OAuth credentials. Login may expire or require another
browser verification, including when moving a session to the home server's network. Such failures stop
the integration and show reconnect instructions; they are never treated as empty results. The owner can
check, renew, revoke selected users or disconnect everyone. Disconnect removes WickedHome's copy; it
does not log out other retailer browser sessions. No automatic CAPTCHA bypass is attempted.

## Groceries page

The groceries page automatically reads the shared Xtra list for selected accounts. It refreshes on entry,
focus/visibility return and every 30 seconds while visible, with a manual refresh button. Xtra changes
made through assistant/MCP tools trigger the same panel through household live events. Settings access
changes clear displayed data immediately; every server read rechecks the saved ACL even on cache hits.

The server follows list pages so checked-off history cannot hide later active items, up to 5,100 items.
A bounded result is labelled partial. A shared 15-second cache limits duplicate retailer calls from family
members; explicit refresh and list writes invalidate it. The panel shows an observed timestamp, active
quantities, checked-off history, and stale/reconnect errors. A failed read is never presented as an empty
list. External list reads do not change WickedHome needs, purchases or stock. This is the Xtra/Colruyt
list; the separate Collect&Go order basket still needs its own browser session.

## Products and tools

Product creation/editing offers **Search Colruyt products** to selected accounts. Results include name,
brand, package content, photo, a validated GTIN when present, and observed price/store/time. Choosing a
result fills the form for review; explicit package sizes are converted to total package content. Saving
retains `colruytProductId` (the technical article number), independently of the retailer's commercial
product-page number. A household-unique reference and existing barcode checks prevent duplicates.
Search flags existing catalogue matches; selecting a result never automatically creates a product.
Unrecognized package sizes stay blank for the person to enter. Prices are displayed as observations,
not silently saved as permanent catalogue prices. Categories and dietary equivalence are not guessed.

When preparing a shopping list, the assistant is instructed to search online for current promotions
separately, using its own browsing or WickedHome's `web_search` / `web_read` tools. Xtra search is not
a complete promotions feed. The assistant must check dates, exact packages, quantities and loyalty or
coupon conditions, cite the sources, and flag unverified offers or unavailable browsing. A promotion
does not automatically apply when an item is added to the Xtra list; substitutions and extra quantities
still need the person's agreement. This guidance appears in MCP initialization, the shopping workflow
guide and Xtra search/add tool descriptions; it is an assistant instruction, not an automatic web crawl
or a server-enforced prerequisite for every list write.

The same assistant registry exposes these names to both chat and MCP:

| Tool | Behavior |
| --- | --- |
| `shopping_xtra_search` | Search live Colruyt products for the connected store. |
| `shopping_xtra_list` | Read a page of the shared list, including completion status. Follow `nextOffset`. |
| `shopping_xtra_add` | Confirm, then add a recently observed whole-piece product and quantity. |
| `shopping_xtra_remove` | Confirm, then remove a recently read list item UUID. |

Every call checks saved account access, including delayed confirmations and retries. Product/list
observations are per person and connection revision, expire after 15 minutes and clear on API restart.
Owners' connection/access changes are audited; assistant/MCP writes use the existing audit mechanism.
The service serializes upstream operations and ACL changes per household in the app's single API
process. Multiple API workers would require a shared lock before this connector is enabled there.

Adds/removals require a stable operation UUID. The journal saves `pending` before dispatch, persists
acknowledged results, and refuses blind replay after uncertainty or a conflicting payload. Addition
checks acknowledgement of the exact item ID/product/quantity; removal rereads list pages to verify the
item is absent. No network mutation is retried automatically. If verification fails, inspect the retailer
list before requesting a new operation. Only explicit whole-piece (`P`) products support additions in
this version; weighted or unknown units must be handled in Xtra itself.

An Xtra list is separate from a Collect&Go basket/order. No tool checks out, pays, marks WickedHome
needs bought or changes household stock. The existing Collect&Go browser integration remains separate.

## Deployment and verification

Run `npm run db:deploy` before starting the updated app: migration
`20261112160000_xtra_product_reference` adds the nullable, household-unique product reference. Existing
products require no backfill. Rebuild and restart the app through the normal deployment procedure.

`DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/shopping/xtra.test.ts src/api/shopping/xtra.routes.test.ts ai/skills/shopping/xtra.test.ts src/features/shopping/types/xtra-browser-import.test.ts`
checks encryption/user isolation, owner-only sharing, revocation, upstream validation, expiry, uncertain
writes and idempotent retries with a fake upstream. `npm run build-storybook` followed by
`node scripts/xtra-browser-smoke.mjs` checks the English/Dutch form and settings on mobile/desktop in
both themes. These are fixture checks; a real account connection and authenticated live list changes
still require the owner to sign in. No real retailer account or list was used during development.

The groceries/session follow-up passed all 44 targeted service/contract/workflow tests, three persisted
basket-browser fixtures and 24 English/Dutch mobile/desktop renders. The latter also checks normal-browser
imports, minimal server payloads, automatic list reads, focus/visibility polling, MCP events, stale/expired
reads and permission revocation during an in-flight request. Run `node scripts/groceries-retailer-browser-smoke.mjs`
after the Storybook build. TypeScript, lint, the application build and Storybook build also passed.
The full unit suite passed 1,743 tests with 61 skipped; the two previously recorded failures in
`receipt-upload.test.ts` and `shared-stock-group-preview.test.ts` remain unchanged.

Protocol reference: [ddvlamin/xtra-mcp](https://github.com/ddvlamin/xtra-mcp), inspected at development time.
Its protocol observations informed this independent implementation; no source code is vendored.
Xtra documents [list transfer to Collect&Go and possible price/availability differences](https://www.mijnxtra.be/vragen/xtra-app/hoe-kan-ik-lijstjes-omzetten).
