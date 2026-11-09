# Shopping and shopping trips

Implementation report for the shopping changes recorded on 7 November 2026. The store feedback predates merge `bdc1a96`. Existing products, `ShoppingItem` requirements, `StockPurchase` acquisitions, `StockMovement` records and `Expense` records are reused; starting a new workflow does not delete household history.

This document describes implemented domain behaviour and records its original validation. The [application-wide redesign](plans/application-redesign/README.md) proposes a simpler interface over that behaviour. Its wireframes are design artifacts, not evidence of a server deployment. The historical test counts below are not new test runs performed during documentation editing.

## Phase 1 — Analysis and critical fixes

- Files: `src/api/shopping/shopping.service.ts`, `shopping-actions.ts`, `shopping.routes.ts`, `ai/skills/shopping/tools.ts`, `src/api/inventory/purchases.service.ts` and regression tests.
- Marking an item purchased immediately suppresses replacement automatic stock needs, including essential items and purchases without a known stock location. Web and MCP share the purchase action.
- Source identities remain idempotent indefinitely. Historical purchases outside a possible current overlap do not block an independent purchase; receipts are still checked against source identity, quantity and previous counts.
- No migration; existing purchases and stock are preserved.
- Recorded targeted result: 69 passing tests, including combined recipe/minimum needs, repeat purchases, replayed old sources and essential-item completion.
- Session isolation, transactional handling and realtime updates are addressed in phases 3–4.

## Phase 2 — Shopping interface

- Files: shopping types/service, MCP tools, `shopping-item-list`, `shopping-item-row`, grouping/preferences, both shopping screens and EN/NL copy.
- Categories use stored product categories rather than name keywords. The ordinary list groups by default; the shop view starts with categories. Category order is a device preference synchronised between tabs.
- Automatic minimum-stock contributions can be hidden without changing stock settings. Mixed recipe/explicit needs remain visible.
- **Not now** stores `SKIPPED`, suppresses immediate automatic repetition and leaves stock, product identity and minimums unchanged. Restoring an item returns it to `OPEN`.
- Migration `20261107170000_shopping_skip` adds an enum value without changing or deleting existing rows.
- Recorded targeted result: 29 passing interface/service regressions. Existing broad categories are reused; no new subcategory tables.

## Phase 3 — Trips and purchase evidence

- Added: `prisma/schema/shopping-sessions.prisma`, `src/api/shopping/sessions.service.ts`, `sessions.routes.ts`, `src/features/shopping/types/sessions.ts`, `data/sessions-requests.ts`, `screens/sessions-screen.tsx`, `src/routes/shopping-sessions.tsx`, `ai/skills/shopping/sessions.ts` and database integration tests.
- Updated shopping routes/public exports/locales, inventory transactions and purchase context, and household/inventory Prisma relations. Category preferences moved into a separate hook.
- Migrations `20261107173000_shopping_sessions` and `20261107180000_shopping_operations` add tables, nullable relations and indexes. Existing `StockPurchase` rows can link to the new acquisition headers.
- A session contains selected needs. Web and MCP support participants, shop/group selection, quantities, partial purchases, skipping, removal, closure and history.
- Session action, purchase evidence, stock movement and status are processed in one transaction. Stable action IDs with payload checks prevent changed retries; revisions prevent lost updates.
- Receipts use existing document storage. Content hash plus printed line identity prevent duplicate imports. Existing acquisitions can be matched; differences require review. Separate receipts may confirm separate acquisitions of the same product.
- Missing receipt products can be added after closure. Untracked products receive an acquisition record without an invented stock increase.
- Recorded result at this phase: eight PostgreSQL integration tests, including concurrent MCP/web updates, two participants, partial purchases, source retries, revision conflicts, multiple receipts and household isolation.
- No new automatic OCR parser was added. Receipt lines are reviewed and matched through web or MCP; payments follow in phase 5.

## Phase 4 — Realtime and concurrency

- Files: `shopping-events.ts`, shopping/inventory services, `use-live-shopping.ts`, existing SSE client, `live-events.test.ts`, editing forms, MCP and integration tests.
- Central service boundaries publish after successful changes, including MCP, recipes, inventory and background replenishment. Lists and sessions share the household SSE stream; focus/polling remain recovery paths.
- Ready/reconnect reloads current server data. Stale fetch results are ignored; events arriving during revalidation cause another refresh afterwards.
- List edits support `expectedUpdatedAt`; sessions use revisions and stable action IDs. A stale quantity cannot overwrite another person's change. Concurrent completion stays idempotent.
- No additional migration; phase 3 action history supports concurrency checks.
- Recorded targeted result: 20 tests, including reconnect with a simulated EventSource; ten PostgreSQL integration tests at this stage, including concurrent MCP/web purchases and one MCP addition reaching two subscribers.
- Immediate SSE broadcasting assumes one API process, matching the current PM2 configuration. Multiple API workers require shared pub/sub; polling alone is not immediate cross-worker broadcasting.

## Phase 5 — Financial links

- Files: `session-payments.service.ts`, session routes/MCP, `src/features/expenses/types/shopping-payment.ts`, existing expenses service, `session-payments.tsx`, session/expense details and EN/NL copy.
- Migration `20261107183000_shopping_payments` adds a linking table with unique source/expense identity. Existing expenses and account records remain intact.
- A payment links an existing paid expense or transactionally creates one through the same expenses service. The receipt may be linked later; attaching a receipt alone creates no expense.
- Supports several payments per session/receipt, joint or personal payment, existing split shares through API/MCP, account selection and actual payer. The web interface represents split payments as separate amounts with distinct references.
- Payment references are idempotent; changed retries are rejected. An expense cannot be linked twice. Known receipt totals prevent over-recording. Navigation connects session and expense in both directions.
- Recorded result: five PostgreSQL financial tests covering parallel retries, account/payer, split payments/shares, expense reuse, overpayment and child-role access. Financial actions do not change stock.
- The existing expense function accepts a transaction context for one-off payments and publishes notifications after commit. Recurring expenses and loans retain their established workflow.

## Phase 6 — Consistency and final validation

- Files: `src/features/shopping/types/product-identity.ts`, `src/types/units.ts`, `src/api/shopping/product-alternatives.ts`, shopping/recipe services, MCP product preparation/matching, additional session/payment tests, `scripts/verify-shopping-migration.mjs`, `scripts/shopping-browser-smoke.mjs`, npm scripts and CI.
- Product matching rejects known conflicting product types. A spread containing olive oil does not match liquid olive oil because the names overlap. Stored categories take priority. Shared stock rejects conflicting types, packaging, units and known package contents; generic stock groups retain packaging metadata.
- Household counts stay simple: one jar is one stock unit without a required gram weight. New shopping/session rows prefer the single known household stock unit, including when the catalogue label is older. Explicit recipe/purchase units are not silently converted. Conversion to grams requires known contents; unknown weight does not prevent counting jars.
- The original catalogue inspection was read-only: the spread was already classified as dairy; tomato paste had ten jars in stock and no known weight. No real stock, recipes, alternatives or finances were changed by that investigation. A PostgreSQL regression covers the older tube/jar label: adding one jar gives eleven without a package weight.
- The checklist emphasises **Purchased** and **Not now**. Quantity, stock location and removal sit under **Adjust**. Purchased/skipped rows move out of active categories into collapsible summaries. Receipt/payment forms are optional sections.
- Further fixes cover shared-stock/bulk suppression, recipe selection without hidden minimum quantities, later stock recording for originally untracked goods, safe session/payment retries and preserving purchase names after removal from a session.
- No migrations beyond the four additive migrations above. Existing entities and roles are preserved.

### Recorded final checks

| Check | Recorded result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 1,603 passed; 23 database integration tests deliberately skipped in this unit run |
| `npm run test:shopping-integration` | All 23 passed on PostgreSQL, including MCP |
| `npm run test:shopping-migrations` | 103 old tables compared; all 14 representative records preserved exactly |
| `npm run test:shopping-browser` | Passed in two independent 390 × 844 mobile Chrome contexts |
| `npm run build` | Client and API built |
| `git diff --check` | Passed |

The browser checks use real login, API, SSE and disposable PostgreSQL: selection, joining, concurrent completion, skipping, closure, PDF upload, receipt/payment retries, offline/reconnect and mobile width. API/MCP tests verify the same service events reach both subscribers. Migration checks start from the earlier schema and compare every stored column value, including stock movement, purchase evidence, recipe requirement and paid expense. This is a disposable dataset, not a production database copy.

### Acceptance cases 1–16

| Case | Automated evidence |
|---|---|
| 1–2 | Essential/minimum completion creates one purchase and movement without a duplicate active need (`sessions.integration.test.ts`) |
| 3 | Skipping changes no stock and does not reappear during the same trip (session/shopping regressions) |
| 4 | Selected products only; idempotent session start (integration/browser) |
| 5 | Partial purchase, cumulative quantity and safe retry (integration) |
| 6–7 | Purchase without receipt, then link the same goods without extra stock (integration/browser) |
| 8 | Identical upload and replayed printed line do not book again (integration/browser) |
| 9 | An old independent purchase does not block a new trip; old source replay remains idempotent (purchase units/integration) |
| 10 | Two participants and MCP/web complete concurrently with one movement (database/two browsers) |
| 11 | MCP service publication reaches two subscribers and the real browser SSE client (integration/browser) |
| 12 | Reconnect loads current state (EventSource/browser) |
| 13 | Recipe/minimum combination avoids duplication; selection can exclude automatic contribution (shopping/integration) |
| 14 | Explicit tube/jar packages differ; jars need no weight; known gram conversion works (units/database) |
| 15 | Purchase, stock, receipt, existing/new expense, account, payer and split payments (financial integration/browser) |
| 16 | Existing data and relations survive migration (`verify-shopping-migration.mjs`) |

### Current interface and proposed redesign

In the implemented interface, open **Shopping → Shopping trips**, select shops and needs, then start. Other household members open the same trip and join. Purchased records the planned quantity; Adjust supports partial quantities and location selection. Not now removes an item from the active checklist. Close after resolving open items. Receipts/payments may be attached later; the printed line number must consistently identify the same physical receipt line.

The proposed interface removes this preparation burden: **start → choose one shop or saved group → automatic checklist → finish → optional receipt/expense/stock review**. See the [wireframe walkthrough](plans/application-redesign/preview/walkthrough.html) and [redesign contracts](plans/application-redesign/architecture-contracts.md). Those proposed screens do not change current API semantics by themselves.

### Reproducing the original domain checks

Use an explicitly disposable database with a name ending in `test` or `ci`:

```sh
export DATABASE_URL=postgresql://USER@127.0.0.1:5432/wickedhome_test
npx prisma migrate deploy
npm run test:shopping-integration
MIGRATION_TEST_DATABASE_URL="$DATABASE_URL" npm run test:shopping-migrations
npm run test:shopping-browser
```

The browser test starts/stops its own API/Vite process, uses temporary document storage and removes only its test household. Chrome/Chromium is required; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may override the path. CI also runs the database, migration and browser checks.

Deploy through the process in [CI-CD.md](CI-CD.md): preserve backups, install dependencies, apply migrations, build client/API and restart the API. This implementation report does not establish the currently deployed revision.

### Limits and effects on existing features

- Receipt evidence is stored and reviewed; no new automatic OCR parser was introduced.
- Category order is device-local; product states, purchases and sessions are household-wide.
- Immediate realtime delivery assumes one API process; multiple workers require shared pub/sub.
- Legacy bulk completion marks list rows purchased without inventing stock. Individual/session purchases credit known stock through existing acquisition records.
- Stale edits return conflicts and reload current state. Receipt quantity differences require review; existing stock is not automatically reduced.
- Product matching conservatively excludes known conflicts. It is not a complete ontology or proof of equivalence, and existing product links were not automatically rewritten.

## Operational AI and MCP guidance

The AI receives these rules through `skills_load` for shopping, inventory, recipes and expenses. Published descriptions and JSON Schemas carry the important semantics; this report is not required reading for ordinary tool use.

- **Read first:** `shopping_sessions` / `shopping_session` return session/item IDs, separate revisions, cumulative purchased quantities, acquisitions and stock locations. Product identity and units come from the existing catalogue/inventory.
- **Ordinary purchase:** `shopping_session_update_item` with `status: bought`, current item revision and stable `operationId` buys the planned quantity. `purchasedQuantity` may be omitted. One jar does not need a gram weight.
- **Partial purchase:** one previously bought plus one more means `purchasedQuantity: 2`, not 1. A new action gets a new ID; a network retry keeps the ID and payload. Re-read after revision conflict.
- **New assessment:** `shopping_plan_visit` assesses needs; `shopping_start_session` copies selected requirement IDs. `includeLowStock: false` excludes automatic quantities without changing minimum stock settings.
- **Skip/restore:** `skipped` buys nothing and changes no stock; `open` restores the item. Closure invents no missing purchases or expenses.
- **Stock:** `stockAdded: false` means an acquisition was recorded without increasing tracked stock. Do not claim otherwise. Resolve ambiguous locations by a recognisable name rather than asking for an internal ID.
- **Later receipt:** upload document → `shopping_session_attach_receipt` → `shopping_session_match_receipt`. Keep a printed line identity stable. Existing acquisition IDs identify the same goods and receive no second stock credit. Differences or later counts require review.
- **Payment:** `shopping_payment_options` reads available accounts, payers and recent paid expenses by ID/name. `shopping_session_record_payment` links an expense or creates one; do not additionally call `expenses_log` for the same payment. One stable reference identifies one payment; separate payments use separate references.
- **Shared access:** web/MCP use the same transactions/events and existing write-confirmation rules. Children cannot read financial options or record payments.

The original delivery also recorded 31 passing MCP/tool contract tests, including JSON Schema generation and skill-guide size limits. An additional PostgreSQL/MCP case verified account IDs, household isolation and financial denial for children.

## Out and Nearly out

The essential/extras filter was replaced with visible **All / Out / Nearly out** controls. Selecting the active option again restores All. Within categories, Out and Nearly out have separate dividers; explicit/recipe needs without a replenishment classification remain in All. The same rules apply to ordinary lists, shop views, session selection and active sessions.

| Stock | Essential | Advice |
|---|---|---|
| Below minimum | Either | Out |
| At minimum | Yes | Out |
| At minimum | No | Nearly out |
| Above minimum or minimum unknown | Either | Neither; explicit needs remain visible |

Out predicts a possible replenishment need; it does not assert that physical stock is zero. Preserve minimums, essential settings and acquisition history. The shared helper serves web/MCP. Raw `stockStatus` remains available; `stockNeed` returns `out` / `nearly_out` and supports MCP read filtering. Session reads refresh stock context; no migration was required.

The original validation recorded 1,603 unit tests and 23 PostgreSQL/MCP integration tests. Mobile coverage checked dividers, both filters and returning to All in the ordinary list, shop view and selection, followed by the established purchase/receipt/payment journey.

## In-place quantity and variant adjustment

The web checklist now opens Adjust with `GeneralFormDialog` and the existing product picker. It changes planned quantity and optionally the selected linked variant without navigation or acquisition. Stock location, partial purchases, extras, removal and payment remain separate controls.

`shopping_session_update_item.productId` is limited to products sharing the current canonical stock owner. The service enforces this, household scope, revisions and retry identities. Switching a variant changes future acquisitions; existing acquisition lines retain `purchasedProductId`/`purchasedProductName` snapshots. The session response exposes each acquired variant as purchase-line `productId` and `name`. Unrelated goods use `shopping_session_add_item`.

This local implementation needs the additive `20261107190000_shopping_variant_history` migration as part of release. The rest of the proposed session-start simplification is tracked in the [implementation status](plans/application-redesign/implementation.md).

## Unified session experience

The ordinary start asks for one shop or saved shop group, then automatically selects current matching needs. No administrative name, checkbox matrix or manual recalculation is required. Shop groups are maintained in Shops using the shared multi-picker. Advanced explicit planning remains available when needed.

The active visit uses a progress summary, category/Out/Nearly out sections, recognisable product images, Bought and Not now actions, and an in-place Adjust dialog. Adjust only changes the planned quantity or verified linked variant. Unrelated goods use the separate shared Add extra dialog. Original requirement and acquisition identities stay stable.

Finishing exposes recorded goods, receipt evidence, a purchase link and the shared payment dialog. Link a paid expense or record one using the existing money input, category and searchable selections. Retry identity is managed by the form rather than requiring a technical reference from the person. Payment linking never credits stock.

Date-only receipts use the start of the household's calendar day as a conservative ordering boundary, not an asserted purchase hour. This avoids future-noon timestamps and retains stock-count review when the actual ordering is uncertain. Both winter/summer time and midnight uploads are tested.

The latest validation and additive migrations are listed in the [implementation report](plans/application-redesign/implementation.md) and [Purchases guide](PURCHASES.md). Earlier phase test counts above are historical results, not current totals.

## Update — optional shopping trips and assistant receipts (9 November 2026)

This section supersedes the earlier description that all shopping checklist rows must be resolved before closing. The changes are committed to `rework_features` and **have not yet been verified by a new CI/test run or deployed**. The historical pass counts above refer only to the earlier revision.

- **Suggestions, not obligations:** an active trip may be closed with any number of OPEN suggestions. These remain on the ordinary shopping list; closing records no additional goods, stock movements or expenses. The UI offers a short explanation and continues to show real purchases separately.
- **Remove an active trip:** the `shopping_delete_session` MCP action and the app's session action hide it using a soft-deleted status. This is intentionally not a cascading SQL delete: an existing purchase, receipt, expense, or recorded stock movement must stay intact. Already-closed trips cannot be removed through this action. A Prisma migration adds `DELETED` and `deletedAt`.
- **Any substitute, optional cataloguing:** before a shopping row has recorded any goods, its selected product can be swapped for any other catalogue product. This is a per-trip choice, **not** a global shared-stock merge. After a partial purchase, only shared-stock variants can be switched without creating a separate row. Free-text one-off goods remain supported, and the app now provides a create-product action in a visit.
- **Multiple retailers:** the destination shop or default product shop is a suggested place to buy. Product shop links support more than one retailer. A printed receipt's actual retailer may replace an older confirmed location on acquisitions explicitly matched to that receipt; idempotent evidence and stock/product/unit checks remain in place.
- **Pre-session purchases:** the receipt matching UI now exposes recent unassigned stock acquisitions from the ordinary shopping list, so a prior check-off can be matched without crediting its stock twice. Purchases from other households cannot be selected.
- **Optional direct receipt upload through MCP:** `shopping_session_upload_receipt` accepts base64 PDF/JPEG/PNG/WebP bytes (up to 4 MB), stores them using the existing documents provider, and attaches the document to the visit. The normal streamed upload in the web UI remains available for larger files. A receipt has no effect on stock or expense amounts until explicitly matched/recorded.
- **Regression coverage added (not yet executed):** `shopping-trip-options.integration.test.ts` covers unbought closure, substitution, deletion without losing acquisitions and receipts, cross-shop reconciliation, and manual purchases from before sessions. `receipt-upload.test.ts` covers inline receipt byte/type limits.

### Acceptance flow

1. Start with a shop or group to obtain useful **suggestions**. Nothing is compulsory. A user may create a product, add a one-off without cataloguing it, choose a completely different product, and buy only what is actually in the basket.
2. When buying, record the selected goods once; known stock increases once. A physical receipt, even from a different store than originally planned, may be added now or later. Matching an existing acquisition reuses it rather than adding more stock.
3. End the visit with unresolved suggestions left on the ordinary list, or delete an active visit entirely. Both preserve all real historical records, while deletion hides the visit itself.
4. The assistant can attach a provided receipt using the MCP byte-upload action once the updated connector is deployed. The user never needs to upload a receipt to complete a shopping trip.

Do not conflate per-trip substitution with permanent catalogue alternative links. Alternatives keep distinct product records, names, brands and package sizes but use one shared inventory count. When stock is in packs, each pack counts as 1 regardless of whether it contains 250 g or 500 g. Linking a product that already belongs to a shared-stock group links the **entire group**, including all its other alternatives. Before a grouped link the UI displays both complete product lists and requires explicit confirmation in the same dialog; the API rejects unconfirmed group merges, and inventory_link_alternative previews all affected names. Measured quantities that cannot be safely mixed with package counts still require a compatible stock unit. The regression test covers Boter + Boni Bakboter together with FAMA + Alpro bakken & braden.
