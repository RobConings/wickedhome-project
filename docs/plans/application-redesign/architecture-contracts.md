# Architecture contracts for one WickedHome

This document accompanies the complete plan and wireframe atlas. It proposes implementation contracts; it does not claim that every described relationship already exists. The existing layer rules in `docs/ARCHITECTURE.md` remain the foundation.

English is the default interface and documentation language. Dutch is supported through feature locale namespaces. API names, stable identifiers and persisted statuses remain language-independent.

## Explicit responsibility for every existing feature

| Feature | Owns | Contributes to other contexts |
|---|---|---|
| assistant | Conversations, AI proposals and access context | Uses the same records and actions; writes through domain services |
| audit | Traceable events | Record activity, without becoming a second business status |
| auth | Accounts, sessions, roles and access | Authorisation and secure context for every panel |
| automations | Job scheduling and execution history | Calls registered domain actions; does not own their records |
| catalogue | Public product identity and relationship contracts over existing product persistence | Product references, variants and linked needs/tasks/projects |
| purchases | Existing acquisition views and deliberate goods-purpose shares | Goods, receipts, expenses and filtered project/product history |
| calendar | Appointments and calendar presentation | Displays tasks, payments and project milestones with their sources |
| contacts | Contact identity and details | Professionals and suppliers linked to projects, devices and documents |
| dashboard | Composed daily read view | Relevant next actions and progress obtained from their owners |
| devices | Device identity, profile, room and maintenance context | Devices in spaces, energy and projects; supports source mapping |
| documents | Files, storage and document links | The same source file linked to a project, purchase, expense, task or device |
| energy | Measurements, tariff settings and consumption/cost estimates | Home and device context; never infers a paid expense |
| expenses | Expenses, recurrence, payment status, payer and cost allocation | Project costs, purchase payments and account activity |
| home-assistant | External connection, entity mapping, current source state and commands | Live home, rooms, devices and energy with freshness and capabilities |
| household | Household and resident records | Person selection, contributions and participants |
| income | Income sources, expected occurrences and actual receipts | Household income and bank/voucher views with consistent meaning |
| integrations | Connections and reviewed import proposals | Requests owner features to create or link approved records |
| inventory | Stock by location, minimums, counts, usage and movements | Product, task, project and recipe context |
| money | Accounts, contributions, transfers, adjustments and projections | Actual balance and forecast with traceable sources |
| notifications | Notifications, delivery, read status and preferences | Links to the original record rather than copying its workflow |
| places | Rooms, floors, zones and floor plan | Location context for stock, devices, tasks and projects |
| projects | Project goal, budget settings, progress and context | Connects tasks, requirements, purchases, costs, spaces and documents |
| recipes | Recipes, meal planning, cooking steps and actual usage | Product references, shopping needs and stock consumption |
| settings | Composition of settings | Each settings section remains a form belonging to its owner |
| shopping | Needs, lists, trips, checklists and recurring items | Uses catalogue and shops; requests central purchase processing |
| shops | Shops and saved shop groups | One recognisable destination selection; groups maintained once |
| tasks | Tasks, scheduling, dependencies, checklists and completion | Task panels for a project, space, device, appointment or payment |
| waste | Waste settings and collection schedule | Calendar context and traceable task proposals |
| weather | Weather data, location and freshness | Context for home, calendar and outdoor activities |

Two logical responsibilities are now explicit: **Catalogue** (Product currently belongs to shopping) and **Purchases** (currently spread across inventory/shopping sessions). Their public typed interfaces reuse existing records. Any later code or schema relocation requires a separate migration and evidence. Preserve IDs and history; do not create duplicate catalogues or purchase ledgers.

## Page host versus data owner

A project page may display an inventory panel. Projects hosts that panel; Inventory still owns the quantities and mutations. The host passes context; the contributor supplies authorised records, counts and actions.

- Projects already composes Tasks' `ProjectTasksPanel` and Shopping's `ProjectMaterialsPanel` through public exports. Extend that pattern.
- A product page receives contributions for stock, needs, project usage, purchases and shop variants.
- An expense page displays its purchase and source document; it does not rewrite purchase lines or stock.
- A room page combines devices, current home status, stock and tasks through their owners.
- A financial overview combines sources without creating a second expense for the same purchase.

Shared components accept presentation data and callbacks. They import no features or API services. Browser features consume other features through public indexes. API code uses domain types and appropriate services without importing browser code. Avoid circular imports through an all-knowing shared registry.

## Relationships carry meaning

A generic link-everything model cannot replace domain rules.

| Relationship | Meaning | Action owner |
|---|---|---|
| Task belongs to project | Context and progress | Tasks validates the project reference |
| Requirement serves task/project | Why something is needed | Shopping |
| Product is present at location | Actual stock | Inventory |
| Purchase line fulfils need | What was acquired and why | Central purchase workflow |
| Stock was used for a task | Actual consumption | Inventory, with task context |
| Purchase line is allocated to a purpose | Quantity/cost assigned to project or household | Purchases/Expenses under the agreed allocation contract |
| Expense pays for purchase | Existing or new financial record | Expenses |
| Document supports record | Reuse of the same file | Existing DocumentLink ownership |
| Entity supplies device state | External current source | Home Assistant with device mapping |

Do not add a universal `projectId` to Product. A project uses products through a need, purchase or consumption. A project budget does not reserve bank funds. Present stock is not automatically reserved. An estimate is not a paid cost, and a sensor reading is not an expense.

## Composed read contracts

Each contribution conceptually includes:

- subject type/ID, required context and owner;
- authorised summary and the meaning of its figures;
- a route to the same filtered records;
- optional actions handled by the owner;
- source, freshness and explicitly missing/unknown values;
- identical access rules for counters, summaries and detail rows.

Existing routes and IDs remain valid. Related-record navigation opens the record at its owner and retains the originating filters and scroll position. Changes from another person or MCP invalidate the same read view through existing post-commit events. This composition does not require microservices or another event platform.

## Writes and financial reconciliation

Workflows may coordinate several owners through typed commands and an explicit transaction boundary. A chain of independent frontend writes is insufficient.

1. Source identities and action identities remain stable across retries.
2. Distinguish line revisions from record revisions. Preserve input on conflict and require a fresh read.
3. Each acquisition and associated stock movement occurs at most once.
4. A later receipt or payment links existing acquisitions and expenses.
5. Allocations plus any unallocated remainder reconcile to the source line, including rounding and corrections.
6. A mixed receipt may serve several projects and the household. Debit its payment account once, rather than once per project panel.
7. Replace or retire the material estimate when the same cost starts counting through a definitive expense.
8. Editing, unlinking, returns and refunds retain provenance and deliberately correct derived views.

Existing project-invoice and session-payment tests prove separate portions. A complete project-material → shopping trip → expense → account test is an explicit first implementation step. The design does not claim that the current tests already prove this entire chain.

## Home Assistant

Reuse `ha-connection.ts` / `ha-client.ts`. Extend them with a capabilities contract per device/entity: readable state, supported controls, permissions and confirmation.

- WickedHome features own names, household context, room, profile and maintenance. External live state retains its source.
- Reconnection refreshes state. Stale and unknown are visible; an older response cannot overwrite a later confirmed state.
- Controls come from real capabilities. A device called washing machine does not automatically support a start command.
- Scene and alarm actions retain existing safety boundaries. The redesign grants no additional AI permissions.
- Energy costs remain labelled estimates until an actual expense exists.
- Manual household management, tasks, documents and finances remain useful without Home Assistant.

## Component contract

Reuse existing compositions as well as primitives:

| Purpose | Existing components |
|---|---|
| Layout | AppShell, PageContainer, PageGrid, Stack, Inline |
| Identity and hierarchy | PageHeader, BreadcrumbTrail |
| Lists and views | GeneralList, owner rows/cards, SearchField, SegmentedControl, PeriodNavigator |
| Record selection | EntityPicker, useSelections, ShopPicker, ProductPicker, ProjectPicker, PlacePicker and other existing wrappers |
| Actions | GeneralForm, GeneralFormDialog, existing domain forms, ConfirmDialog |
| Recognition and progress | IconChip, StatTile, Progress, TimelineList, Badge, Avatar, Card |
| State | Existing empty, error, loading and pending components |

`EntityPicker` remains a single selector. `EntityMultiPicker` composes it with large removable selected rows for genuine multiple selection, such as saved-group management. Ordinary trip start selects one shop **or** one group, with no second shop selection.

Production AppShell now accepts a generic `mobileNavigation` slot with persistent daily destinations and More opening its existing mobile menu. The app frame owns the destinations and their grouping.

`useSelections` now includes `shop_group`. Shops owns the destination wrapper and saved groups; a single encoded `shop:<id>` or `group:<id>` choice is validated before start. Both shop/group favourites and recent choices reuse the existing preference service.

## Visual and language direction

Rob's original household-hub reference guides warm surfaces, forest/sage branding, sunny accents, colourful icon tiles and meaningful progress. Central tokens and component variants provide consistency across features. Preserve light/dark themes, keyboard access, clear focus, contrast, touch targets and reduced motion.

Progress counts real completed steps. Not now is handled but not purchased. Amounts, stock and connection health do not become invented scores. Avoid rewards for spending or consequential physical controls. Residents, milestones and brief completion feedback provide playfulness.

English copy is the source language; Dutch receives equal treatment in page titles, filters, forms, accessibility labels, states and AI explanations. Never translate persisted identifiers or use a translated label as a mutation identifier. Preserve household units such as jars/packs/pieces without demanding unnecessary weights.

## AI and MCP

AI uses the same owner actions, context, revisions, access checks and source identities as the app. `app_help` and screen context point to canonical records and entry points. Resolve recognisable shops, groups, people and projects to IDs; users should not need internal terminology or technical preparation steps.

A new or moved user journey is complete only when web and MCP documentation, examples and tests reflect its relationships and access rules. See [AI and MCP workflow contract](ai-mcp-contract.md) for the required context, action sequence and acceptance cases.

## Record images and cover ownership

The redesign preserves existing recipe/project banners, cover choosers and image cards. Products keep
their catalogue image reference; device photos now use an attached Documents image selected by Devices. Documents retains
file/storage ownership and each feature selects its authorised cover/reference. Overview, list, picker
and detail reuse that reference. Shared media behaviour handles aspect ratio, crop/contain, loading and
fallback; it does not own records. See [images and view modes](visual-media.md).

## Related-record summary navigation

Use one shared Card + IconChip + Link composition for record relationships. Owner features supply a
typed ID, label, optional summary value, icon/accent and authorised destination. The host identifies the
current subview. The phone layout uses two columns; the whole card is focusable/clickable and the active
link declares `aria-current`. Labels and summaries are separate typed fields in production; the prototype
adapter splits authored fixture copy only. Counts and rows retain the same owner, permissions and source.
See the [related-record contract](related-records.md).
