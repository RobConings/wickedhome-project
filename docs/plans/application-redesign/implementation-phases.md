# WickedHome total rework — implementation phases

**Status:** implementation has started on `rework_features`; the product workspace and two opt-in shared controls are the first production slice. **The 78-screen HTML prototype is a visual and navigation guideline only.** It is not an inventory of all existing capabilities, a universal page renderer, or evidence that a module is complete.

## Core decision: consistent grammar, different workspaces

WickedHome is for people running a household, not ERP administrators. Reuse recognizable page identity, back/return context, color, media, readable stats, primary usage and management actions, bilingual labels and linked records. **Do not force two tabs, four stat tiles, or a list of cards onto every screen.** Each feature chooses the best layout for its work:

| Interaction | Appropriate experience |
|---|---|
| Product, expense, recurring obligation, project, task, shop, person, device | A dedicated record workspace with useful Details and linked Overview where appropriate |
| Shopping trip, cooking session, inventory counting, transfer, expense payment | Focused step-by-step workspace with prominent state and one next action |
| Calendar, home explorer, floor-plan editor, energy flow | Native calendar/map/canvas/chart as the dominant content, with contextual inspector and connected records |
| Feed, search, shopping list, accounts, audit, documents | List/grid/detail composition with sorting, grouping, filters and useful previews |
| Settings, connections, imports, permissions | Task-oriented forms, connection state, confirmations and progress, not artificial dashboards |
| Assistant and MCP | Conversational context and direct owner-service actions; the same outcomes and permissions as web |

**Navigation rules:** a meaningful user-facing record has a stable owner-owned page; related records open their own owner pages, not duplicated CRUD views. Real owner-supplied links and history, not guesses. A record's Details / Overview is optional, not an obligatory pattern for calendars or editors. One primary day-to-day action and one management action may each have contextual dropdowns where appropriate. The desktop header and two-row mobile action positioning follow the approved product example; menus overlay content.

**Data rules:** product quantity is a household total in natural package units wherever recorded, not forced multi-room micromanagement; preserve existing location records, stock movements and historical details in advanced paths until a separately tested migration is approved. Do not add average-use metrics that do not exist. Unrecorded fields (currently including product brand) stay unknown until implemented, never invented.

## Phase A — capability inventory and guardrails (opened, not completed)

1. Snapshot `main` and `rework_features` business capabilities, existing routes, forms, service APIs, data models, jobs, permissions, MCP tools and migration assumptions. The earlier 65-route/62-dialog atlas is a starting index, **not** outcome-level coverage.
2. For **every** feature, build a matrix: existing user outcome → current service/API and persistence → intended simple entry point → connected records → edge cases/permissions/automation → test → status. Track missing or risky capabilities explicitly. Preserve history, IDs and source attribution.
3. **Finance first audit:** recurring expense schedules and individual occurrences, paid/unpaid history, splits, direct debit, loan early repayment, contributions, transfers, vouchers, account corrections and forecasts. Validate no double counting.
4. Audit existing inventory package/quantity semantics and alternative-product shared stock. Product **brand** is not currently a persisted read-model field and needs a separately reviewed schema/API/form migration before showing a genuine brand value.
5. Preserve release boundaries: no production DB changes, migration or deployment in a presentation/code review. Schema moves need additive migrations on an isolated database.

**Gate:** each existing outcome has an owner and planned path or an explicitly tracked gap; no capability disappears because it is absent from the prototype.

## Phase B — optional shared experience foundations (in progress)

- [x] Start a reusable **Details / Overview** record section with the active section in the URL, preserving origin/filter parameters.
- [x] Start accessible primary-action + dropdown controls for everyday actions and management.
- [ ] Verify these additions with Storybook, keyboard, 320/390px phones, desktop, EN/NL and theme variants; do not claim this gate finished without running the full suite.
- [ ] Consolidate visual tokens and media slot/crop policy; photograph fills its region, packshot retains label via contain. Avoid text-overflow and empty visual padding.
- [ ] Extend stable record breadcrumbs, focused return navigation, owner-filtered related-record section composition and permission-aware actions across remaining features.
- [ ] Ensure component APIs offer opt-in composition without hardcoding business-specific content or forcing every screen into a record template.

**Gate:** real reusable primitives and shared behaviour are validated without replacing feature-specific workflows.

## Phase C — vertical reference journeys (in progress)

**Product → shopping → purchase → inventory → finance** is the first reference, while real finance and recurring obligations form a second independent reference.

- [x] Begin a production product workspace: image + total stock + truthful summary, Details as the default, colored product info/table/notes, linked Overview, primary actions, advanced legacy stock access.
- [x] Keep the real shopping and alternative-product owner services; added a preflight for already-open shopping needs including variants.
- [ ] Complete product brand/shop/package/unit accuracy, status/minimum rules and actual photographed media; inspect and test the existing data before introducing changes.
- [ ] Verify owner-linked context panels, actions, use/adjust/scan/count, stock history, child roles, alternative stock, and shopping provenance end-to-end.
- [ ] Complete recurring-expense template → occurrence → paid expense → account history, including transfers, projects, attachment and calendar/automation effects.
- [ ] Run real integration tests on a disposable DB plus browser/Storybook examples for happy paths, permission failures, concurrency, edits, retries, empty and historical records.

**Gate:** complete real journeys work with the same service results in web, API and authorised MCP before converting every module.

## Phase D — feature-owner conversion (not complete)

Group by household use and dependency, but accept each area only after comparing its *actual* implementation with the plan.

| Order | Features | What must survive in a more understandable experience |
|---|---|---|
| 1 | shopping, inventory, catalogue, purchases, shops, recipes | List/session/category/low-stock rules, manual/recipe/task needs, shared variants, receipt reconciliation, scanning/counting, cooking and real stock effects |
| 2 | expenses, income, money, projects, tasks | Recurrence, loans, splits, expected/actual, vouchers, accounts, transfers, reconciliation, budgets, assignments, dependencies and history |
| 3 | dashboard, places, household, contacts, calendar, documents | Useful Today; floors/rooms/geometry; family access; people; day/week/month calendar; attachments/origin |
| 4 | devices, home-assistant, energy | Real HA capability/freshness, secure commands, device maintenance, nested meters and non-overlapping solar/battery/grid/gas flow |
| 5 | assistant, audit, automations, auth, settings, integrations, notifications, waste, weather | Equivalent authorised actions, run history, source review, security/roles, messaging and correct source/refresh states |

The order does **not** authorise removal or postponement of cross-feature dependencies. A feature can be a dedicated form, editor, timeline or workflow; not every feature needs tabs.

**Gate per feature:** all old outcomes are retained/redesigned and verified, existing URLs and owner links work, web/MCP parity holds, and EN/NL/responsive/keyboard/touch states pass.

## Phase E — interoperability and whole-application acceptance (not started)

- Walk complete chains: product → alternative → needs → shopping → purchase → stock change → expense → account; recurring obligation → occurrence → payment → account → forecast; task → project → materials → receipt; device → place → live control → energy.
- Test owner permissions, child access, household boundaries, duplicate source handling, status/history meaning, offline/unknown HA, unknown versus zero metering.
- Test all features at 320/390/1440px, both languages and themes, keyboard and touch; automated unit/integration/migration/browser/Storybook checks must be fresh.
- Mark open items explicitly. A passing build or entry-page smoke test is **not** complete acceptance.

## Phase F — deployment (separate approval)

Run validated migrations and server/environment checks only through the reviewed CI/CD process and an explicit deployment decision. Do not treat a `rework_features` commit as a deployed feature. Preserve backups, data and rollback strategy.

## Continuation log — 8 November 2026

First committed code: `src/components/shared/record-workspace-tabs.tsx`, `split-action.tsx`, rewritten `src/features/inventory/screens/product-stock-screen.tsx`, simplified `catalogue/components/product-context-panels.tsx`, bilingual inventory copy, shared Storybook examples and `productAlreadyOnList` test. These are **implementation in progress**, not production or whole-module acceptance. The branch's CI workflow currently triggers on `main` push / pull requests targeting `main`, not normal pushes to `rework_features`; fresh full checks are still required in a development checkout.

Related: [rollout checklist](rollout-checklist.md) · [capability preservation](feature-preservation.md) · [wireframe feedback](wireframe-review-and-model-workspaces.md) · [interactive prototype](preview/all-feature-wireframes.html).
