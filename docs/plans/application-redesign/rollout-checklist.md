# Full implementation rollout

**Active continuation:** baseline `6f3e1b7` on `rework_features` (passing GitHub CI reported at handover); see the [current implementation ledger](implementation-continuation-2026-11-08.md). The implementation pass is now delivered; the product owner authorised only feature-local checks during development, with final application review kept separate. Historical baseline `2dda61a`; see the [follow-up implementation and validation ledger](followup-implementation-2026-11-08.md) for newly implemented energy, history, account, product and record-owner work and fresh check status. Earlier checkpoint counts below remain historical evidence.

**Current execution plan:** [revised implementation phases](implementation-phases.md). Keep the original Stage 1–5 history below as evidence, but apply the newer phase gates to the total rework. A household calendar, floor-plan editor or shopping session is **not** forced into the same record-tab layout as a product. The 78-screen wireframe is a style and flow reference, not a full feature inventory.

The user authorised the complete redesign. This checklist tracks completion across the full application; an individual change does not complete a stage. Work continues until the remaining capability and workflow checks are satisfied. The existing local edits are preserved; deployment remains a separate release operation.

**Required preservation gate:** follow the [feature preservation and outcome-parity contract](feature-preservation.md). The wireframes are not a complete feature specification; every existing capability must remain reachable and deliver the same result, even if the UI is substantially simpler. Capability loss requires explicit product-owner approval. In particular, recurring expenses, tasks and automations must not disappear because a mock-up omits them.

**Additional wireframe review (8 November):** [model workspaces, media, quick actions and full finance coverage](wireframe-review-and-model-workspaces.md) is an explicit open design/implementation requirement. The current atlas is **not signed off**. Related counters and routes are a foundation, not proof that every user-facing business record has its own useful, deep-linkable workspace.

**Design preview update (8 November):** the [complete-feature HTML atlas](preview/all-feature-wireframes.html) now has 78 illustrative screens across all 29 existing feature owners. [Coverage](preview/all-feature-coverage.json) shows the sample screens and [preview limitations](preview/all-feature-wireframes-README.md) distinguish wireframe coverage from full feature/route/dialog acceptance. **This does not complete Stage 4 or 5.**

## Stage 1: capability and ownership inventory

- [ ] Inventory every first-class user-facing business model and map its overview, actions, owner-filtered related records, deep links and return context; inspect the real implementation and services, not only route/dialog names.
- [ ] Audit complete recurring expense, income, account, contribution, transfer, voucher and money-flow capabilities against the redesigned entry points.

- [x] Inventory current routes, dialogs and feature owners in the design catalogue.
- [x] Document stable identities, financial meanings and owner boundaries.
- [ ] Complete capability-by-capability acceptance beyond route/dialog inventory and entry-point smoke checks.
- [x] Prove mixed project/household purchase and expense allocation, with no duplicated account effects.

## Stage 2: shared UI foundation

- [x] Shared related-record cards; existing form/dialog and picker reuse.
- [x] Shared multi-selection composition replacing shop checkbox matrices.
- [x] Grouped application navigation, persistent mobile navigation and shared page identity.
- [x] Shared return-to-context navigation and restored list positions.
- [x] Shared imagery, banners, progress and filter foundations implemented; complete adoption belongs to Stage 4.
- [ ] Complete Storybook and responsive/browser acceptance of all additions. Earlier and current targeted runs are evidence for their named stories/journeys, not every feature/state.

## Stage 3: complete connected journey

- [x] One shop/group start, automatic current checklist, stable retry identity.
- [x] In-place quantity and verified variant adjustments, preserved purchase history.
- [x] Clear bought/not-now/extras/completion/receipt/payment interface throughout.
- [x] Product → need → project/task → acquisition → receipt → expense allocation → account reconciliation.
- [x] Web and MCP parity with real-service tests of the implemented reference-journey invariants.

## Stage 4: module conversion — implementation delivered, acceptance open

| Module | Required review and implementation | Completion |
|---|---|---|
| Dashboard | Room map, useful daily progress, connected source states and clear next actions | Implementation present; final outcome/interaction acceptance remains open |
| Tasks | Related project, materials, room, blockers, documents and consistent action hierarchy | Implementation present; final outcome/interaction acceptance remains open |
| Shopping | Simple destination, checklist, extras, history, receipts and payments | Implementation present; final outcome/interaction acceptance remains open |
| Shops | Shops/groups ownership, shared selection, reusable group management | Implementation present; final outcome/interaction acceptance remains open |
| Inventory/catalogue | Product identity, photos, stock, needs, tasks/projects and acquisition history | Implementation present; final outcome/interaction acceptance remains open |
| Recipes | Keep covers, photos/card/list modes, meal needs, cooking and actual usage | Implementation present; final outcome/interaction acceptance remains open |
| Calendar | Events and source overlays, owners and return navigation | Implementation present; final outcome/interaction acceptance remains open |
| Projects | Keep banners, progress, tasks/materials, costs, purchases, contacts and documents | Implementation present; final outcome/interaction acceptance remains open |
| Expenses | Purchase/source links, project shares, payments, receipts and recurring obligations | Implementation present; final outcome/interaction acceptance remains open |
| Income | URL-based focused views, expected/received/source forms, vouchers and account contributions | Implementation present; final outcome/interaction acceptance remains open |
| Money | URL-selected account activity, transfers, contributions, forecasts and reconciliation | Implementation present; final outcome/interaction acceptance remains open |
| Places | Rooms/zones/floors stay first class, floor plans and owner-contributed related panels | Implementation present; final outcome/interaction acceptance remains open |
| Devices | Images, profiles, state freshness, supported controls, room and typed maintenance tasks | Implementation present; final outcome/interaction acceptance remains open |
| Home Assistant | Actual supported source capabilities, mappings, scenes and source availability | Implementation present; final outcome/interaction acceptance remains open |
| Energy | Source measurements, appliances, configuration and estimates distinguished from expenses | Implementation present; final outcome/interaction acceptance remains open |
| Household | Residents, role-aware actions, profiles and linked household context | Implementation present; final outcome/interaction acceptance remains open |
| Documents | Existing file identity, folders, images and linked-record ownership | Implementation present; final outcome/interaction acceptance remains open |
| Contacts | Recognisable contact cards and linked work/projects | Implementation present; final outcome/interaction acceptance remains open |
| Integrations | Connection states, reviewed imports and source-owner links | Implementation present; final outcome/interaction acceptance remains open |
| Settings/auth | Focused owner sections, legacy deep links and existing account/security forms | Implementation present; final outcome/interaction acceptance remains open |
| Assistant/MCP | Current guides, schemas, authorised context and equivalent owner workflows | Implementation present; final outcome/interaction acceptance remains open |
| Notifications | Clear linked source, read/delivery state and preferences | Implementation present; final outcome/interaction acceptance remains open |
| Automations/audit | Existing jobs, run history, traceable source actions and recovery | Implementation present; final outcome/interaction acceptance remains open |
| Waste/weather | Source freshness, settings and existing dashboard/calendar/task contributions | Implementation present; final outcome/interaction acceptance remains open |

## Stage 5: application acceptance — incomplete

- [x] Deliver the inventoried module implementations, including the remaining record, finance, contact and supporting workflows. Acceptance remains a separate gate.
- [ ] Verify all retained capabilities and their resulting owner workflows, beyond opening entry points.
- [ ] Complete application-wide English/Dutch, theme, phone/desktop, keyboard and touch acceptance.
- [ ] Complete whole-application checks. Targeted unit/integration/build/Storybook/browser runs for the implemented reference slices are tracked in [implementation](implementation.md).
- [x] Record implemented evidence separately from remaining scope.

Stage 4 implementation is delivered; its final acceptance gate and whole-app acceptance remain open. The [implementation report](implementation.md) records the completed foundation/reference workflows and their passing tests; those tests do not establish completion of every planned screen or feature. Deployment and physical HA checks are separate release/environment operations.

## Current local evidence

See [implementation](implementation.md) and the [product/finance outcome matrix](capability-matrix.md) for the 8 November continuation. The first workspace now compiles locally; recurring expenses have a dedicated schedule/payment composition. Neither a successful targeted run nor a bounded history preview completes the module. Phases A–E remain open; deployment is not performed.

## Current implementation decisions

- Keep the established phone + / desktop Quick action interface with optional search, all role-filtered actions and keyboard shortcuts. This follows the latest product-owner direction and supersedes the earlier proposal to replace it with search and Add.
- Recurring obligations expose documents on both the schedule and its migrated original subscription; MCP reads/detach include both identities.
- Shops compose real owner-filtered catalogue offers, contacts and recent purchases. Unknown price stays unknown. Purchase money stays redacted for children.
- Purchases distinguish actual acquired quantity from credited stock, expose recorded source needs/shop, and open receipt document workspaces as well as raw files.
- Stock history now opens verified surviving purchase, need and cooking records, including through MCP. Ledger tiles retain the same source links/actions as rows.
- Owner links retain return context; main searchable lists retain query/view and shop/device filters in the URL. Cooking entry retains its recipe/meal-plan origin.
- These latest implementation additions have **not** received final validation. Do not reuse earlier passing counts as acceptance evidence for them. No deployment or production migration.

## Final implementation pass following `8a76def`

- Dedicated contribution-plan workspace: actual schedule, person/account, monthly activity, related dated plans, preserved effective-date versioning and existing edit/transfer/delete actions.
- Dedicated voucher activity: the existing FIFO/expiry calculation, received credits and actual expense shares with independent history paging; original receipt and expense owner links; future income stays expected.
- Person finance contribution, contact-side project link/role/unlink, household assistant context, safe assistant answer links and quick-chat navigation.
- Task action hierarchy uses Complete/Edit with contextual Skip/Hold/Snooze/Delete, retains linked-source restrictions, and returns keyboard focus from dialogs.
- Audit targets resolve surviving scoped owners; historical labels remain intact. Activity filters stay in the URL. Automation source links preserve all schedules, switches and run/history controls.
- Recipe/project photography and product/counting media use the shared cover/contain/fallback treatment. Historical recurring documents remain detachable; all new uploads go to the current schedule.

The original Quick actions remain unchanged. No production migration, deployment or main merge. See the continuation ledger for the exact feature-local evidence; no claim of whole-application acceptance is made.
