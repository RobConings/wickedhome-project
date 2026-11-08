# Implementation continuation after `6f3e1b7`

Branch: `rework_features`. Started from a clean local checkout matching the handover commit. The product owner reported passing GitHub CI. Existing product-brand persistence/API/MCP and buying-need workspaces were inspected and retained.

## Current instructions

Complete implementation before further test runs. No additional compiler, lint, test, Storybook or build runs during the implementation stage. Keep the established Quick actions: phone + sheet, desktop Quick action menu, existing role-filtered actions and shortcuts, optional search. The earlier proposed search/Add replacement was removed after product-owner feedback.

No production deployment, production migration or merge to `main` is authorised. Changes are committed only on the redesign branch.

## Implemented since handover

| Area | Concrete behaviour | Owner/preservation boundary |
|---|---|---|
| Recurring obligations | Schedule documents plus original migrated subscription documents are accessible on the workspace | Existing Documents UI and role checks; no attachment migration, deletion or duplicate payment |
| Documents / MCP | `recurring_expense` attachment target merges current/original identities for reads; detaches a file from both without deleting it; new attachments use current identity | Existing file scope, read tokens, confirmations and owner validation |
| Account activity | Selected account shows its actual balance/owners/month, correction/edit/other-entry forms; header transfer preselects the account and avoids duplicate transfer buttons | Existing Money forms/services/derived ledger; archived account transfer hidden |
| Recipes / cooking | Recipe, ingredient and meal-plan owner links retain origin; starting cooking returns to the exact recipe/meal-plan context | Existing cooking/use/undo, ingredient conversions and stock automation unchanged |
| Shops | Recorded product offers with price/article/URL, preferred-shop distinction, supplier contacts and recent purchases | Route composes Shopping, Contacts and Purchases contributions; no second CRUD implementation |
| Supplier contacts | Shop-filtered contacts can be called/mailed/opened; adults can create with the shop preselected | Same Contact form, validation and `/contacts` action; children read only |
| Shop API/MCP | Product/contact/purchase shop filters validate shop visibility; `shops.context` uses these actual owner reads | Household/built-in shop scope; purchase amounts remain redacted for children; no fabricated live availability |
| Catalogue | Product names open their owner workspace; brand shown/searched; consistent contain/fallback row media | Existing shopping/edit/delete/offer and shared-stock actions retained |
| Purchases | Recorded shop/source needs, acquired vs credited stock quantities, stock history, receipt document workspace plus original file | No new purchase, consumption or account debit; historical optional fields remain compatible |
| Stock history | Movements link back to surviving acquisition/visit, need and cooking owners; MCP exposes the same sources | Existing persisted relationships only; soft references verified within the household; no stock writes |
| Connected navigation | Record links from tasks, devices, maps, projects, finance, documents and dashboard retain origin | Origin is navigation context only, never permission or source-data authority |
| Ledger presentation | Source links and permitted actions work in both row and tile views; recorded counterpart account/person links | Same derived ledger, undo/delete owner actions and real balances; no duplicate cash movement |
| List return state | Search/view on main owner lists; shop type and device category/profile; notification unread/all are in URLs | Existing filters and owner actions retained; URL updates preserve other parameters |

Loading, empty and failed owner contributions stay distinct; supplier contact creation refreshes through route revalidation. Shop contributions use English/Dutch text and flexible phone layouts. Layout and end-to-end acceptance remain pending.

## Validation boundary

Before the request to defer testing, scoped validation passed 1,622 unit cases (51 skipped), 37 shopping/connected-record DB cases, seven finance DB cases and seven energy DB cases. These results **do not validate the later UI/API changes above**. The recurring-document and loan finance cases cover current/original attachments, MCP permissions, partial/final repayment, overpayment rejection and undo/re-pay account effects. Only the disposable loopback DB received the already committed brand migration.

The expanded browser script reached its new recurring document/loan steps successfully, then exposed an older unscoped bill-count assertion. Both assertions now scope through payment → purchase → session; the corrected script has not been rerun. Storybook examples/script changes made before the deferral remain present. Final combined checks must run after implementation, without repeating unchanged baseline checks at every small step.

Whole-application acceptance remains open. Preserve the outcome inventory and phase gates; do not replace outcome evidence with route counts or a passing entry-page smoke test.
