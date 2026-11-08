# Full implementation rollout

The user authorised the complete redesign. This checklist tracks completion across the full application; an individual change does not complete a stage. Work continues until the remaining capability and workflow checks are satisfied. The existing local edits are preserved; deployment remains a separate release operation.

**Required preservation gate:** follow the [feature preservation and outcome-parity contract](feature-preservation.md). The wireframes are not a complete feature specification; every existing capability must remain reachable and deliver the same result, even if the UI is substantially simpler. Capability loss requires explicit product-owner approval. In particular, recurring expenses, tasks and automations must not disappear because a mock-up omits them.

**Additional wireframe review (8 November):** [model workspaces, media, quick actions and full finance coverage](wireframe-review-and-model-workspaces.md) is an explicit open design/implementation requirement. The current atlas is **not signed off**. Related counters and routes are a foundation, not proof that every user-facing business record has its own useful, deep-linkable workspace.

**Design preview update (8 November):** the [complete-feature HTML atlas](preview/all-feature-wireframes.html) now has 78 illustrative screens across all 29 existing feature owners. [Coverage](preview/all-feature-coverage.json) shows the sample screens and [preview limitations](preview/all-feature-wireframes-README.md) distinguish wireframe coverage from full feature/route/dialog acceptance. **This does not complete Stage 4 or 5.**\n\n## Stage 1: capability and ownership inventory

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
- [x] Storybook coverage and responsive/browser validation of all additions.

## Stage 3: complete connected journey

- [x] One shop/group start, automatic current checklist, stable retry identity.
- [x] In-place quantity and verified variant adjustments, preserved purchase history.
- [x] Clear bought/not-now/extras/completion/receipt/payment interface throughout.
- [x] Product → need → project/task → acquisition → receipt → expense allocation → account reconciliation.
- [x] Web and MCP parity with real-service tests of the implemented reference-journey invariants.

## Stage 4: module conversion

| Module | Required review and implementation | Completion |
|---|---|---|
| Dashboard | Room map, useful daily progress, connected source states and clear next actions | Partial; implemented additions and entry-point checks do not complete module conversion |
| Tasks | Related project, materials, room, blockers, documents and consistent action hierarchy | Partial; implemented additions and entry-point checks do not complete module conversion |
| Shopping | Simple destination, checklist, extras, history, receipts and payments | Partial; implemented additions and entry-point checks do not complete module conversion |
| Shops | Shops/groups ownership, shared selection, reusable group management | Partial; implemented additions and entry-point checks do not complete module conversion |
| Inventory/catalogue | Product identity, photos, stock, needs, tasks/projects and acquisition history | Partial; implemented additions and entry-point checks do not complete module conversion |
| Recipes | Keep covers, photos/card/list modes, meal needs, cooking and actual usage | Partial; implemented additions and entry-point checks do not complete module conversion |
| Calendar | Events and source overlays, owners and return navigation | Partial; implemented additions and entry-point checks do not complete module conversion |
| Projects | Keep banners, progress, tasks/materials, costs, purchases, contacts and documents | Partial; implemented additions and entry-point checks do not complete module conversion |
| Expenses | Purchase/source links, project shares, payments, receipts and recurring obligations | Partial; implemented additions and entry-point checks do not complete module conversion |
| Income | URL-based focused views, expected/received/source forms, vouchers and account contributions | Partial; focused views implemented; implemented additions and entry-point checks do not complete module conversion |
| Money | URL-selected account activity, transfers, contributions, forecasts and reconciliation | Partial; account navigation implemented; implemented additions and entry-point checks do not complete module conversion |
| Places | Rooms/zones/floors stay first class, floor plans and owner-contributed related panels | Partial; implemented additions and entry-point checks do not complete module conversion |
| Devices | Images, profiles, state freshness, supported controls, room and typed maintenance tasks | Partial; maintenance relationship implemented and database-tested; implemented additions and entry-point checks do not complete module conversion |
| Home Assistant | Actual supported source capabilities, mappings, scenes and source availability | Partial; implemented additions and entry-point checks do not complete module conversion |
| Energy | Source measurements, appliances, configuration and estimates distinguished from expenses | Partial; implemented additions and entry-point checks do not complete module conversion |
| Household | Residents, role-aware actions, profiles and linked household context | Partial; implemented additions and entry-point checks do not complete module conversion |
| Documents | Existing file identity, folders, images and linked-record ownership | Partial; implemented additions and entry-point checks do not complete module conversion |
| Contacts | Recognisable contact cards and linked work/projects | Partial; implemented additions and entry-point checks do not complete module conversion |
| Integrations | Connection states, reviewed imports and source-owner links | Partial; implemented additions and entry-point checks do not complete module conversion |
| Settings/auth | Focused owner sections, legacy deep links and existing account/security forms | Partial; section navigation implemented; implemented additions and entry-point checks do not complete module conversion |
| Assistant/MCP | Current guides, schemas, authorised context and equivalent owner workflows | Partial; implemented additions and entry-point checks do not complete module conversion |
| Notifications | Clear linked source, read/delivery state and preferences | Partial; implemented additions and entry-point checks do not complete module conversion |
| Automations/audit | Existing jobs, run history, traceable source actions and recovery | Partial; implemented additions and entry-point checks do not complete module conversion |
| Waste/weather | Source freshness, settings and existing dashboard/calendar/task contributions | Partial; implemented additions and entry-point checks do not complete module conversion |

## Stage 5: application acceptance — incomplete

- [ ] Finish module conversion before accepting the complete application.
- [ ] Verify all retained capabilities and their resulting owner workflows, beyond opening entry points.
- [ ] Complete application-wide English/Dutch, theme, phone/desktop, keyboard and touch acceptance.
- [x] Tests, architecture lint, builds, Storybook and real browser journeys pass for the implemented changes.
- [x] Record implemented evidence separately from remaining scope.

Stage 4 and whole-app acceptance remain open. The [implementation report](implementation.md) records the completed foundation/reference workflows and their passing tests; those tests do not establish completion of every planned screen or feature. Deployment and physical HA checks are separate release/environment operations.
