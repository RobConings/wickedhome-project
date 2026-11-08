# Wireframe review and model workspaces — product-owner feedback (8 November 2026)

**Status: design requirements and gaps; not implemented or approved as a finished design.**

Reference supplied by the product owner: local `app-samenhang.zip` containing `plan.plan.html`, a built `site/` atlas, and 27 exported desktop/mobile screenshots. The source ZIP is **not in this repository**. Those exports must be considered together with the current branch and existing owner-domain documentation, not substituted for working implementation evidence.

The direction is promising, but the result is **not the target experience**: generic quick actions feel awkward, many thumbnails do not occupy their media area convincingly, finance and other developed features are incompletely represented, and related-record counters do not yet form a complete, useful Odoo-like business-object experience.

## Shopping visit workspace — owner feedback and release gate (8 November)

The original production shopping-session overview and active checklist fail the product-approved product-page baseline. These are **acceptance blockers**, not optional cosmetic polish:

- **Back in the title row, everywhere:** the shared `PageHeader` must place the existing context-aware Back button beside the page identity, never on its own standalone row. Do not duplicate it in custom records. Explicit exceptions must be reviewed.
- **Shopping sessions overview:** an active visit is a **fully clickable card**, visually identifiable by actual shop/group names and shop logos, date and active status. Active visits come first; past visits follow. The primary Start shopping action opens the existing destination picker in a compact dialog. Advanced planning is secondary and collapsed, never above active visits.
- **Focused active checklist:** remove three/four rows of page tabs, sort, live-state copy, stock pseudo-tabs and other scaffolding above the first item. Session detail has a compact title + Back, contextual join/close (close requires confirmation), actual compact progress, and the shared two-tab record treatment (Checklist default, Purchases/receipts). Live state belongs with identity, not as a standalone paragraph.
- **Real shopping rows:** use actual product/variant images when available, shared media fallback, one compact product row with easy Bought / Not now / Adjust actions, and progressively disclosed acquisition quantity and stock-location options. Keep touch targets usable on phones. A bought item remains part of history; skipping does not add stock.
- **Preserve workflows and data:** existing start/matching selection, shop-group sessions, favourites, participation/live updates, status/progress, purchase amounts, corrections/variant selection, receipts/reconciliation, stock counted vs later acquired, payments/account expenses and historical links must remain reachable and unaltered by layout. No missing actual image should produce invented media.
- **Visual acceptance is separate:** compare the redesigned sessions overview and active visit side by side with the accepted product workspace at 320 / 390 / 1440 px, in both languages and themes; verify keyboard navigation, logos/fallbacks, no overlapping menus, exact Back origin, 15-item checklist, multi-shop group, errors, child role, purchase/receipt/payment workflows, and live multi-device updates. Source commits alone do not establish acceptance.

Implementation points: `src/features/shopping/screens/sessions-screen.tsx`, `src/features/shopping/components/session-visit-card.tsx`, `src/components/shared/page-header.tsx`, and `src/components/shared/record-workspace-tabs.tsx`. A failing CI/build or missing screenshot remains an explicit **open blocker**.

## A. Non-negotiable product direction

1. **Every first-class, user-facing business record has a dedicated, deep-linkable workspace.** It shows the record's identity, state, primary contextual action, meaningful details, and relevant related models. This applies throughout the application, **not only to products or projects**. Avoid a contextless generic list on a record detail screen.
2. **Navigate relationships in both directions**, where the relationship genuinely exists: product ⇄ linked variants/products ⇄ stock/locations ⇄ shopping needs/lists ⇄ recipes ⇄ tasks ⇄ projects ⇄ acquisitions/purchases ⇄ shops/prices ⇄ expenses/payments ⇄ accounts, and similarly across home, devices, contacts, documents, energy, income and calendar.
3. A relationship is **not ownership**. Each model's owner feature is the sole source of truth for writes. A host record shows owner-supplied counts/previews and routes to owner-owned full views, with current record filters and return context. Counts, permissions, states and amounts must agree.
4. **Full feature/outcome parity.** The atlas samples some screens; the full implementation contains more. Recurring expenses, money flow, scheduled work and all existing supported behaviour must be represented by discoverable workflows. The user welcomes **simpler interfaces producing the same outcomes**; preserving old UI layouts is not required. See [feature preservation](feature-preservation.md).
5. **Do not infer relationships or physical/financial actions.** Unknown data stays unknown; a shopping need is not a purchase; stock is not a reservation; a paid expense is not a second ledger transaction; a device state is not a supported command; a project link is not proof of consumption.

## B. Observations from the supplied wireframe screenshots

| Screenshot / preview | What works | Specific gap to redesign |
|---|---|---|
| `dashboard-1440.png`, `dashboard-390.png` | Clear Today focus, task/shopping/project pointers, home information | The generic “Quick action” and “Search or quick action” compete with contextual actions; large stacked mobile blocks need prioritisation; home explorer must remain genuinely floor-based, not regress to room cycling |
| `inventory-product-1440.png`, `inventory-product-390.png` | Visible stock/tasks/projects/purchases counters | Under the record, an unrelated product list occupies the main content. A true **product workspace** needs identity/photo/variants/alternatives, shopping needs, stocked locations, links to recipes, tasks/projects, shops/prices, purchases/history, documents and meaningful actions. A detail view is not a catalogue search page |
| `money-1440.png`, `money-390.png` | Actual vs projected balance is distinguished | Illustrates a summary, not comprehensive account/transaction/income/recurring expense workflows; linked financial records need drill-down, editing and reconciliation. Missing deep coverage is not approval to drop features |
| `project-detail-1440.png`, `project-detail-390.png` | Helpful banner, progress, related counters, budget summaries | Related sections need actual owner-filtered lists and drill-down, not only aggregate cards/recent links; preserve documents, contacts, tasks, budget breakdown, purchases, recurring costs and history |
| `purchase-detail-1440.png`, `purchase-detail-390.png` | Goods/project/expense/receipt connection is visible | Make quantity, origin, receipt, shop, stock movement, project purpose, payment and linked expense inspectable as separate but connected facts |
| `shopping-390.png`, `visit-active-390.png` | Simple checklist with clear actions | Improve meaningful item image/thumbnail use, category grouping and one-step task actions while retaining all stock/low-stock and partial-purchase semantics |
| `house-live-390.png`, `room-live-390.png` | Room/device capability information exists | Avoid a long page of generic tiles replacing the full-floor explorer and map inspector; show valid actions per source state, with useful media where available |

This is a **representative review**, not an exhaustive audit of 178 atlas variants. All 27 screenshots and the HTML build are supplied as local references, and their presence does not prove production behaviour.

## Shopping-list control hierarchy — acceptance rule (8 November, production feedback)

The production shopping list must not stack page navigation, list chips, search, automatic replenishment, category order, sorting and stock-status pseudo-tabs as separate horizontal rows. That hides the actual checklist and makes different kinds of controls appear to do the same job.

- **Section navigation:** use the established shared `SectionNavigation` component only to move between the shopping list, shop view and shopping sessions. These are distinct pages, not stock filters.
- **List selection:** choose All lists or one saved list in a labelled selector. It must not look like a second competing navigation bar or a set of tabs.
- **Checklist toolbar:** show search and one clear View & filters trigger alongside list selection. On desktop it is one row when space permits; on a phone it can flow into two compact rows.
- **Inside View & filters:** preserve sorting, stock status, automatic minimum-stock inclusion, category order and explanatory guidance. The stock statuses All / Out / Out + nearly out / Nearly out are filters, **not** tabs. Changing the UI must not change existing list membership, shopping quantities, purchase flow or URL filters.
- **Checklist first:** after the shared page navigation and toolbar, show the shopping items and their category/need grouping. Avoid an additional row for unselected filters or generic results text; announce filtered results accessibly.
- **Acceptance:** compare at 320 px, 390 px and desktop widths in EN/NL, including a custom list, a URL-applied stock filter, query input, a long list name, reset/selection and keyboard access. Code review alone is not screenshot or behaviour acceptance.

## Shopping page actions and consistent page tabs — follow-up requirement (8 November)

Production feedback clarifies two additional binding UI rules:

- **Two contextual split actions in the Shopping header:** a prominent **Start shopping** action opens the existing one-destination session-start form directly in an overlay on the list page; the person does **not** first navigate to Shopping sessions. The normal backend start action still determines current matching needs and redirects to the live session. A second **Add shopping item** split action opens the established add form. Each split action keeps a dropdown for related navigation/management (shop view, session history, products and creating a list), respecting permissions. Do not introduce a third row of large actions.
- **Consistent full-width page tabs throughout WickedHome:** the Shopping / Shop view / Sessions navigator and product Details / Overview tabs share the same layout tokens (height, surface, active indicator, spacing, responsive behaviour and focus visibility). Reuse one set of styling rules rather than per-feature handcrafted tab designs. The semantics may differ: route navigation must remain links with `aria-current`, while local panel tabs have actual tab panels and keyboard tab semantics. Search, sorting, list choice and stock filters are not tabs.
- **Release acceptance:** verify both split actions and each dropdown, opening the session picker from Shopping, successful creation/redirect, invalid destination handling, custom lists, child permissions, EN/NL, keyboard and 320/390/1440px screens. Confirm the product and shopping tab bars are visually consistent without hiding the checklist.

## C. A real record workspace, Odoo-inspired but household-friendly

### Universal record anatomy

```text
[Back to filtered origin / Breadcrumbs]                    [Contextual primary action] [More…]
[Record image / icon]  Name / identity  [status] [important metadata]
[Optional banner / meaningful summary only]

[Overview] [Related model: count/status] [Related model: count/status] …  ← real links/sections
  Main: record-specific details and current work
  Side or below: 1–3 relevant next actions and recent meaningful relationships
  Optional local section: owner-filtered records, searchable, with Add/Link/Remove when permitted

Every related record opens its OWN workspace, and Back returns to the originating record,
section, filters and scroll position. No copy of the related model's editor is required.
```

- A first-class record with a lifecycle or identity should have a stable record URL, not just a modal or generic index. Existing URLs and historical redirects stay valid.
- **Smart buttons/cards** communicate a useful count, state or amount and open a *filtered owner view*. On a phone, use a compact scrollable or two-column layout rather than allowing the full record to become a long stack of empty summaries. Hide empty relationships when appropriate, but keep available **Add/Link** actions discoverable; do not fake zero/unknown.
- The default tab is **About/Overview** with the facts relevant to that record, **not a generic catalogue/list**. Related lists show only records related to this record, with an explicit relationship filter, owner permissions and clear provenance.
- A linked record must be inspectable and editable in its owning model without losing context; avoid duplicate CRUD implementations in hosts. Supporting link/unlink or allocation is itself an intentional owner-validated action.
- All records support loading/empty/error/permission states, accessible navigation, EN/NL labels, and mobile/desktop layout. Relationship cards may be lazy-loaded, but must remain internally consistent with the list they open.
- Technical join tables, derived aggregates and hidden audit internals do **not** each require an artificial sidebar page. The requirement is a discoverable workspace for **meaningful user-facing business objects**, including relationship details when they carry distinct data or lifecycle.

### Relationship and workspace inventory (initial baseline, not an exhaustive schema audit)

| Workspace / owning feature | Minimum relevant model navigation and outcomes |
|---|---|
| Product / catalogue | Linked products and verified variants; stock by location; minimum/needs; shopping lists; recipes/ingredients; task materials; projects/purpose; shops, prices and links; acquisitions; documents/image; usage history. Actions: add to list, scan/count/use or buy via owning features |
| Stock/product-location / inventory | Product, physical place, count and movements, minimums, reserved/required vs available distinction, acquisition and shopping need; count/use/replenish |
| Shopping list and shopping need / shopping | Product/variant, quantity, shop/group, source (manual/minimum/recipe/task/project), sessions and bought history; source-specific open/adjust/remove and reorder behaviour |
| Shopping trip / purchase | Destination, participants, bought/not-now/extras, receipt, actual acquired lines, source needs, project goods allocation, expense/payment and related stock movement |
| Shop / shops | Address/contact/site, products/prices/variants, lists needing this shop, sessions, purchases and receipts, preferred shop choices |
| Recipe and cooking instance / recipes | Ingredients/products/alternatives, stock sufficiency, shopping needs, to-cook plan, steps/usage, documents |
| Task / tasks | Place, assignees, recurrence, predecessors/related tasks, device, project, required materials, shopping needs, stock, documents and completion/history |
| Project / projects | Goal/places, tasks/dependencies, requirements/materials, acquired goods, invoices/expenses (incl. recurrence), actual/committed cost shares, contacts, documents and budget |
| Expense and recurring expense / expenses | Individual due/payment record ⇄ recurring template/occurrence; payer/splits, payment method/reference, linked purchase/receipt, shop/beneficiary, project cost shares, calendar/payment task, documents, account effect and paid/unpaid history |
| Income source and income receipt / income | Person/joint, recurrence, expected/received occurrence, fixed amount history/variable amount, voucher lot, target joint account, related cash-flow timeline |
| Account, ledger entry and contribution plan / money | Actual vs forecast balance, correction, transfers, contribution plans and recorded transfers, income credits, paid expenses, source record and audit trail. Never double count a paid expense |
| Place/floor / places | Plan, rooms/zones, tasks, devices/capabilities, inventory, projects, documents, appliances and readings. Explorer is floor-based; a room has its own context |
| Device/profile / devices + Home Assistant | Place/floor marker, profile/configuration, live source mapping/freshness/capability, room tasks/maintenance, energy appliance/meter branch, documents/manual, owner-validated controls |
| Energy appliance/meter / energy | Physical device/place, parent and child meters, readings vs estimate, residual “Other”, energy source/period, tariff/cost and links to configuration. No inferred expense or unsupported control |
| Calendar event/source / calendar | Participants, place, linked task/expense/recurrence/project/shop visit, dates, ownership/source and action |
| Document / documents | File origin/provider, folder, supported linked records, revision/history and the owning record |
| Person/contact / household + contacts | Permissions/household role, assigned tasks, projects, expenses/income/contributions and relevant contact/project details |
| Automation/notification / owner features | Job/source/trigger, settings/history, linked task or expense, last result and effective actions, without becoming a second owner |
| Assistant conversation / assistant | Real linked entities and authorised actions with context, preserving the same service outcomes as the UI |

**Acceptance sample — product:** from a product, open its linked variant → product workspace, inspect inventory by place → inventory workspace, open the reason it is on a shopping list → shopping need and its source, inspect a purchase → linked expense → account line, then Back through the origin chain. Empty/unknown data must never be fabricated. The same principle generalises to every row above.

## D. Earlier generic quick-action proposal (superseded)

**Product-owner correction, 8 November:** keep Quick actions as they were, with optional search. The existing phone + sheet and desktop Quick action menu, role-filtered actions and keyboard shortcuts are retained. Contextual owner-page actions continue alongside them. The replacement proposal below is historical review feedback, not the current requirement.

### Original proposal

The current header's **Quick action** and sidebar **Search or quick action** affordances are not satisfactory as the primary design. Treat this as a **redesign item**, not a request merely to recolour the button.

- **One clear primary action per context**, using its natural noun/verb: *Add product*, *Log expense*, *Manage recurring*, *Record transfer*, *Count stock*, *Start shopping*, *Add task*, *Attach document*. Don't use a vague “Quick action” title to compete with it.
- Product/project/account detail pages show **record-specific** actions with the correct current record preselected. E.g. on a recurring expense: *Edit schedule*, *Pause*, *Mark this occurrence paid*; on a product: *Add to list*, *Count stock*, *Link alternative*.
- Global search is **search** and command navigation; don't conflate it with an “add” CTA. If a global create menu remains, make it discreet and optional, grouping a handful of real common actions and respecting roles. The same tasks must stay available through their dedicated model pages without a global menu.
- Never hide core finance, recurring, inventory or account management behind one generic menu. Avoid duplicated “Create” buttons all over a screen. Confirm destructive actions, and provide quick undo where the domain permits.
- Prototype and validate both desktop and 390 px phone interactions before treating a quick-action design as settled.

## E. Image and card-media contract

The user's requirement is **images that genuinely fill their allotted visual part of the card** instead of postage-stamp thumbnails or empty frames.

- Define a stable media slot per reusable card/list variant. Use the whole slot with a deliberate aspect ratio, good edge-to-edge treatment, and `object-fit: cover` / focal positioning for **photographic** images (recipes, rooms, projects, device photos and relevant hero images).
- For **packshots, product labels, logos, receipts, technical drawings and floor plans**, use **contain** when cropping would remove useful/identifying information; give the image a visually full, intentional media region with an appropriate neutral surface, not a 15 px icon in a large unused area.
- A list row thumbnail must have a real, consistently sized media column rather than shrinking when text grows. A grid card should put the image in a dedicated top media region rather than squeezing it between padded text.
- Preserve useful recipe/project banners; handle missing/broken media with a consistent branded fallback; preserve device/source status and accessibility semantics. Distinguish attached real media from placeholder icons.
- Verify content-aware crops on representative product packages, wide room photography, portrait images, device images, and mixed mobile/desktop cards in **both** themes and both languages. Avoid overflow and excessively tall empty cards.

## F. Finance must be first-class in the wireframes, not reduced to a cash-flow tile

The screenshot of `money-1440.png` is a summary example; it is **not** sufficient coverage of the existing finance subsystem. Add complete and usable reference journeys for:

1. **Expense list → actual expense workspace:** unpaid/paid/overdue, amount, payer and splits, method, IBAN/BIC/structured reference/EPC QR where valid, attachments, shop, project shares, receipt/purchase links, status/history and linked payment task.
2. **Recurring obligations → recurring expense workspace:** templates for subscriptions, insurance, loans, instalments and other kinds; schedule (RRULE), start/end, expected occurrences, edit series vs one occurrence, pause/resume/end, direct debit rules, payment/status history, amount changes and forecast. A recurring payment must remain manageable even when it has no wireframe.
3. **Income → income source and receipt:** recurring fixed/variable expected amounts, historical changes, one-off income, received status, vouchers and expiry, payee/person/joint, selected account effect.
4. **Money flow → account workspace:** account history and reconciliation, opening balance/corrections, real vs projected balance, contributions and plans, inter-account transfers, recorded income and paid expenses with links back to their source documents. Account cash movement must not be duplicated by a linked purchase or expense.
5. **Project ↔ expense ↔ purchase ↔ bank:** a mixed household/project receipt allocates purpose and cost accurately; unknown allocations remain explicit; same expense has one payment/account effect.
6. **Calendar/automations/assistant:** recurring generated or calculated due dates, reminders and direct debits are still visible and functional and match owner-service rules.

Cross-reference the existing [finance guide](../../FINANCE.md), [project guide](../../PROJECTS.md), [purchases guide](../../PURCHASES.md) and [feature-preservation contract](feature-preservation.md). Illustrate both common and advanced actions; progressive disclosure is encouraged, omission is not.

## G. Priorities and acceptance

**P0 — specification and preservation (before approving new wireframe as complete)**

- [ ] Compare *all currently implemented domain capabilities* to the 178 atlas variants; create a per-outcome matrix with target entry point, actual underlying service, edge cases and acceptance evidence.
- [ ] Introduce complete finance/recurring expense/income/account workspaces and interconnected walkthroughs.
- [ ] Establish the universal record workspace contract and verify bidirectional owner-filtered links across every first-class business model, not just a product/project example.
- [ ] Replace the unsatisfactory global quick-action UX with context-specific actions without removing existing shortcuts/outcomes.

**P1 — design and code adoption**

- [ ] Update reusable card/media variants, thumbnails, fallback, focal/crop choice and grid/list consistency; visual review on 390/1440 widths.
- [ ] Replace generic lists shown within record details with **record-specific owner-filtered related sections** and inline relationship actions where valid.
- [ ] Ensure route/deep-link/return-to-origin behaviour across records, tabs, filters, mobile and desktop.
- [ ] Add Storybook fixtures and tests for empty, error, permission, long labels, unknown values, cross-model counts, currency, recurrence and links.

**P2 — whole-app acceptance**

- [ ] Validate actions through web and MCP, with owner-service permission checks, no stock duplication, no financial double counting and history-preserving migrations.
- [ ] Check EN/NL, light/dark, keyboard/touch and responsive layouts for every model workspace, not just the main journey.
- [ ] Mark a domain as complete **only** once its capabilities, relationships and designed navigation are proven end-to-end.

The uploaded wireframes are **input to the next design iteration**, not an accepted final state. No claim is made here that the missing interface work or code modifications have been completed.
