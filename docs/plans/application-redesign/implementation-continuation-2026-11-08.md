# Implementation continuation after `6f3e1b7`

Branch: `rework_features`. Started from a clean local checkout matching the handover commit. The product owner reported passing GitHub CI. Existing product-brand persistence/API/MCP and buying-need workspaces were inspected and retained.

## Current instructions

Finish the implementation pass. The latest product-owner instruction permits very local feature checks when needed; avoid repeating baseline suites. Final compilation/packaging follows the implementation pass. Keep the established Quick actions: phone + sheet, desktop Quick action menu, existing role-filtered actions and shortcuts, optional search. The earlier proposed search/Add replacement was removed after product-owner feedback.

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

## Final owner and support implementation

The remaining inventoried implementation paths are now delivered. This closes the code pass; full application/release acceptance remains a distinct gate.

| Area | Delivered implementation |
|---|---|
| Contribution plans | `/money/plans/:planId` shows the real plan, person, account, dated related plans and monthly recorded activity. Existing edit, versioned amount changes, transfers and delete remain. Later effective amounts navigate to the new plan ID and close the old edit dialog. Activity is explicitly for the person/account/month, never falsely assigned to one plan. |
| Meal vouchers | `/income/vouchers/:personId` exposes the existing FIFO balance, actual received credits and expense shares with independent paging, source owners and expiry. Future income stays expected; uncovered spending remains explicit. `income.vouchers` uses the same read service and adult MCP role rules. |
| People and contacts | Adults can inspect a person's plans/accounts and voucher activity. Contact workspaces now link/unlink projects and edit project roles through the existing Contacts action. Resident and login identities remain separate; household/person assistant context is looked up within the household. |
| Assistant | Escaped inline text supports bold and safe internal/external Markdown links. Internal navigation retains owner origin and closes the quick Ask sheet; external web links open separately. Unsupported/executable/credentialed links remain text. Conversation, streaming and confirmation services are retained. |
| Activity | Surviving targets are resolved in scoped batches and open their owner workspace. Foreign/missing/unsupported targets remain historical text; labels are not rewritten. Search, source/person/action filters and view persist in the URL. |
| Automations | Job definitions optionally supply their owning workspace; web and MCP expose it alongside existing schedules, state, controls and run history. The scheduler/lease/retry/permission rules are unchanged. |
| Tasks | Complete and Edit remain primary; Skip, Hold/release, Snooze and Delete share the contextual menu. Source-owned deletion restrictions remain. Dialog cancellation restores focus to the menu, and URL filtering preserves record origins. |
| Media and legacy documents | Recipe/project photographs fill a deliberate slot with failure fallback; packages retain contain. Original recurring attachments can still be detached, while new attachments/uploads go to the current schedule. |

Local evidence for these changes: two finance workspace DB/MCP cases, one scoped audit-target DB case, two assistant inline-link cases, and the focused record-workspace browser journey. The browser exercises actual contribution versioning, contact project link/role/unlink, audit owner/filtered return and 320px/1280px finance layouts. A separate task-only browser flow verifies menu → Hold/Delete cancellation and focus return, Snooze's real owner mutation and phone overflow. These are deliberately feature-local; they do not replace final whole-application acceptance.

### Final packaging and source checks

- TypeScript validation passed; lint passed for the changed source, stories and focused browser harness after fixes.
- Application client/server builds passed. The final server bundle includes scoped audit target handling, and the final client bundle includes exact account-to-account return context.
- Storybook packaging passed with the added contribution-plan, voucher and original-document examples. The exhaustive Storybook matrix was not repeated.
- Feature-local browser results above passed. No broad baseline unit/integration suites were rerun during this closing pass.

No remaining implementation gap is recorded in the current outcome inventory. Phase E still describes final whole-application acceptance, not additional placeholder implementation. Keep that gate explicit when reviewing or releasing. This branch has not been deployed or migrated in production.
