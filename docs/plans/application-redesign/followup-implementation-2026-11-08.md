# Follow-up implementation — 8 November 2026

Baseline: `2dda61a` on `rework_features`, which contains the earlier locally validated reference work. This continuation preserves that commit and all earlier work. The following changes are local; no deployment, production migration, push or server-copy edits were performed. The wireframes remain visual/navigation guidance.

## Implemented outcomes

| Area | Concrete access and preserved behaviour | Evidence |
|---|---|---|
| Product relationships | Overview lists recipes with recorded ingredient links, including the canonical shared-stock family. Product documents use the Documents owner; real offer URL/article number/price remain distinct. Scan and focused household counting are explicit actions. | Real DB test excludes namesakes/foreign recipes, retains attachment identity and has no stock/money side effect. Two-phone browser follows recipe and count origin paths. |
| Recurring history | `/expenses/recurring/:id/payments` pages every stored occurrence and extra repayment, independent of the bounded preview; paid/unpaid filters and origin persist. Ended templates resolve through MCP. Exact old expense IDs remain readable through MCP. | Finance DB history/paging/filter/boundary/MCP case; workspace stories. |
| Expense account impact | Adult expense contribution names the actual selected/default account and opens its existing history line/month. Unknown, unpaid, personal, pre-opening and scheduled states are explicit; no second ledger transaction. | Finance DB selected/default account, correction/opening, undo, MCP role and no-duplicate assertions; browser expense → account → Back. |
| Energy branches | Parent selection is saved by the owner API/MCP with household serialization, cycle/carrier/boundary validation, omitted-parent preservation and explicit independent roots. Appliance workspace has actual device/place, sources, documents, parent and children. | Six real DB cases including concurrent reparenting, permissions and deletion; two-phone browser follows parent/child, edits and returns to the exact period. |
| Energy flow | Grid/solar/home/battery/gas period energy network; nested inclusive readings with Other at every node; roots do not double count descendants. Missing is unknown, excess is visible. Source and measured-bucket coverage are inspectable, not claimed as complete interval coverage. Charts, tariffs, peaks, manual readings and import remain. | Six energy DB cases cover unknown/zero, mismatched channels, one-sided battery and 23/25-hour Brussels days; EN/NL theme/viewport stories and axe cases. |
| Income records | `/income/sources/:sourceId` shows schedule, amount history, selected-month occurrences and bounded all-time receipt pages. `/income/receipts/:incomeId` reads old records directly, links source and explicit account; existing edit/delete/receipt forms and voucher rules remain. Account ledger income lines open their receipt. New MCP source/receipt reads share the services. | Five-case finance suite includes old receipt, historical fixed amount, account credit exactly once, source deletion, household and child MCP boundaries. New stories await final combined run. |
| Contacts | `/contacts/:contactId` is readable by children, with every phone/email, address, company, trade, website, notes and actual shop/projects. Explicit inline editing, favourites, project link/unlink and delete remain. Project contact names open the contact owner and chips retain origins. | Compiler/lint; new owner stories and focused interaction checks in progress. Existing Contacts services and role middleware retained. |
| Documents | `/documents/files/:fileId` exposes identity, provider/upload state, folder and verified reverse owner links. Names in drive/attachments open the workspace; preview/download remain in the menu. Rename/move/trash/restore/Drive storage stay with existing services. Foreign/missing generic attachment references do not expose owner metadata. MCP document info includes the same links/URL. | New real DB test verifies reverse scope, rename/move identity and unchanged attachments with no stock/money effect. New stories and focused interaction checks in progress. |
| Household | `/habitants/:habitantId` shows real resident identity/login presence, existing edit/delete constraints, documents and Tasks-owned assigned work including old closed tasks. Adult income entry selects the actual person. Pet has no artificial financial shortcut. | New real DB task case verifies historical assigned scope, foreign isolation and child completion restrictions; new owner stories await combined acceptance. |

## Timestamp transport correction

Real energy interval integration exposed a Prisma/PostgreSQL connection timezone mismatch: the ORM round trip appeared correct while the stored physical timestamp shifted on a Europe/Brussels database connection. `src/api/lib/db.ts` now sets the pool session timezone to UTC (`options: "-c timezone=UTC"`). Household date/period arithmetic still explicitly uses Europe/Brussels. A raw epoch assertion verifies physical instants; spring and autumn day tests conserve all measured Wh. No stored rows were rewritten or migrated. Existing historical production timestamps have not been inspected or repaired; that is a separate environment/data review, never an implicit redesign migration.

## Validation ledger

- TypeScript and lint passed before the newest household/document additions; final combined reruns are pending.
- Unit suite: **1,617 passed, 47 skipped**. Skipped cases are explicitly enabled database suites; they are run separately, not counted as passed by `npm test`.
- Shopping/connected-record/task integration: **36 passed** on disposable loopback PostgreSQL.
- Finance integration: **5 passed**, including the new income owner case.
- Energy integration: **6 passed**.
- Expanded two-phone shopping browser journey passed, including product recipes/count, expense/account and energy hierarchy actions; this run predates the new contact/income/document/household routes.
- Storybook build passed with the new owner screens. Focused interactions/accessibility and full responsive matrix are being rerun; do not reuse old render totals as current evidence.
- Production build and migration-preservation checks require the fresh final run recorded below.

These outcomes do not automatically accept every feature. See the application outcome inventory, revised phases and rollout checklist; Phases A–E still have explicit work. Deployment remains outside this task.
