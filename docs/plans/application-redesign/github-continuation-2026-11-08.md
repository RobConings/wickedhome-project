# GitHub continuation — 8 November 2026 (after Codex push)

**Scope:** commits on `rework_features` after Codex's pushed `89ec40f`. This is a development continuation, not a deployment or whole-feature acceptance. Existing feature and outcome contracts remain in force.

## What the preceding Codex push delivered

The [follow-up implementation ledger](followup-implementation-2026-11-08.md) records completed slices for product→recipe/document relationships, paginated recurring-expense history, account effects, typed energy branches and period flows, income records, contacts, documents and household members, with separately recorded test results. Its statement that work was "local" was true **when written**; the user has now pushed it to GitHub. No production deployment is implied.

## New implementation slice: product brand

The approved product Details design requires real **brand** information (not a guessed prefix from the product name). The original Product schema and read model omitted it, even though barcode suggestions already carry an optional brand.

- Added nullable `Product.brand` in `prisma/schema/shopping.prisma` and the additive `20261108160000_product_brand` SQL migration (`ALTER TABLE products ADD COLUMN brand TEXT`).
- Extended the validated product input, Product read type and Shopping service serialization; the product form can **edit and clear** brand.
- A barcode suggestion supplies brand **only when it is actually returned**, with an editable field. Existing products remain `null` until somebody fills them in. Do not mine product names or backfill labels from guesses.
- Older API/MCP clients that omit the brand field **do not erase an already saved brand** when updating a product. Explicitly clearing it writes `null`.
- The Product Details screen displays the persisted value; brand text search is supported without overriding a simultaneous barcode/QR query.
- Added `product-brand.test.ts` coverage for omission, trimming, clearing and maximum length. **The new changes have not yet been executed in a full local test environment.**

This change does not alter historical stock quantity, linked alternatives, receipts, purchases, expenses, household balances or recurring tasks. The migration is only committed; it has **not** been run against a production database.

## Assistant and MCP parity

The existing `inventory.save_product` / `inventory_save_product` tools can now accept and update an **explicit** brand value. Omitting it retains an existing value; passing `null` clears it. Product search/details and the saved-field verification response expose the stored value. The assistant's completeness check now reports unknown brand when no brand was recorded; a shop offer with no verified brand cannot be described as complete. `productInputOf` retains brand across unrelated recipe/offer updates.

An earlier CI unit failure was traced to a shopping assistant **test double** that assumed catalogue search used only `where.name`; brand-aware Prisma search now wraps name/brand conditions in `AND` to preserve code filters. The test double was updated to match this query structure and an explicit brand-search, persistence, omission and clearing regression was added. **Passing CI for the corrected code is not assumed until GitHub reports it.**

## Documentation and verification

- Codex's original `docs/plans/app-samenhang/` export (screenshots, built `site/`, HTML and other assets) was moved **intact** to `docs/plans/application-redesign/legacy-wireframe-export/`. This restores the English directory naming convention and keeps its internal relative paths.
- CI `verify` now also runs on `rework_features` pushes. The existing `deploy` job is **still gated to `main`** plus `WICKEDHOME_AUTO_DEPLOY=true`.
- Before accepting the brand slice, run `npx prisma validate`, migration on an isolated DB, `npm run typecheck`, lint, unit/integration tests, product-form Storybook/browser checks, and the full build. Check create/edit/clear, old client omission, barcode prefilling, role/household scope and persisted reads.
- Do not treat old Codex test counts as evidence for this new migration. If CI fails, fix the reported regression before advancing module acceptance.

**Next planned work:** finish and verify owner-to-owner navigation and missing shopping-need / account / expense workflows using the [outcome inventory](application-outcomes.md), [capability matrix](capability-matrix.md) and [phased rollout](implementation-phases.md). A generic common record layout must not replace each feature's own UI.
