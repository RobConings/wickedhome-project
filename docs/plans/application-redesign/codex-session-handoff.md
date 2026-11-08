# Codex session handoff — 7–8 November 2026

This is a **compact, technical handoff** extracted from the full Codex session history supplied by the product owner. It is not a verbatim transcript, independently run test report, or proof of deployment. The full uploaded transcript also contains experiments and failed tool calls. Compare this with **actual code** before claiming completion.

## Baseline and release boundary

- Canonical repository: `RobConings/wickedhome-project`; redesign branch: `rework_features` (not `feature_rework`).
- Original Codex worked in the Mac local checkout; the household server and its network-mounted copy are separate. GitHub pushes do **not** deploy the app or migrate the production DB.
- The branch received an **intermediate push**, not a final accepted release. Do not infer full test coverage from earlier passing counts.
- Follow the [feature-preservation contract](feature-preservation.md): **preserve complete user outcomes and business rules, not the old screens/click count**. Missing wireframes never authorise removing a capability. Improved, simpler journeys are encouraged when the outcome and advanced operations remain accessible.

## Product direction and explicitly requested behaviour

- A cohesive, connected household application with Odoo-like related-record navigation. Each feature owns its facts and writes; related screens only compose/read/link them. Shared components, predictable hierarchy, one obvious primary action, return context, meaningful icon cards, playful colours and useful imagery.
- English-first documentation and UI; Dutch is fully supported. Responsive phone/desktop layouts, keyboard/touch accessibility, card/list views, recognisable recipe/project banners, larger product/device thumbnails and consistent **Back in the page header**.
- Shopping trip: choose **one shop OR one saved group**, see an automatic checklist, mark Bought/Not now, adjust quantities or a **linked variant in place**, add unrelated extras, finish, attach receipts and record/link the actual payment. Exactly-once purchases/stock effects and retry/concurrency safety matter.
- Grocery views and shopping trips retain **Category/Name sorting**, and All/Out/Nearly out/**Out + nearly out** filtering. Globally alphabetic Name sorting must not regroup by urgency. Below minimum = Out; at minimum essential = Out; at minimum nonessential = Nearly out. Out means *replenishment recommended*, not necessarily zero on hand. The same rule applies on web and MCP.
- Inventory quantities can be practical household units (one jar), without mandatory grams. Keep product variants/alternative links, stock identity and purchase provenance.
- Retain **all financial features** even if the atlas omits them: recurring expenses/subscriptions/loans, direct debits and statuses, payer splits, payment references/QR, income, meal vouchers, accounts, transfers, contributions, corrections, budgets, history and their task/calendar/automation effects. Prevent double counting.
- **Home explorer is a full-screen floor map** switching **floors, not rooms**. Rooms remain visible and first-class. Selecting markers opens a desktop side inspector or phone sheet with relevant actions/detail CTA. A space opens with its floor plan primary; retain editing/drawing and allow adding devices and room-linked tasks through the editor. Don't invent physical task coordinates.
- Devices include camera, alarm, smoke, temperature and heating capabilities (including radiators/floor heat), backed by actual Home Assistant entity support. Show unknown/offline/stale states, not invented live controls.
- **Energy:** preserve charts, plus visual grid/solar/home/battery flows and gas consumption, grid import/injection, solar production/self-use, battery charging/discharging. Distinguish live power vs period energy. Meter branches drill into devices/rooms; every measured branch exposes **Other = parent total minus accounted child meters**. Unknown stays unknown; never double count included child meters.
- **Calendar retains day/week/month** and date navigation. Assistant/MCP tools use the same domain services, identities, permissions and jobs as the app.

## Actual state when Codex stopped

- Stages **1–3**: route/dialog/feature inventory, shared foundations and key connected shopping → purchase → stock → project cost/expense journeys were reported implemented. Design atlas: 178 variants, covering 65 routes, 62 dialogs and 29 feature directories. The atlas illustrates UX, it does **not** fully specify existing functionality.
- Stage **4 — module conversion:** **PARTIAL**. Implemented in the session, subject to verification: section navigation; contextual links; focused Income and Money views; Settings sections/legacy anchors; typed device-maintenance task relationship and MCP parity; visual media and sorting; floor-plan explorer/inspector and device/task editor contributions.
- Stage **5 — full acceptance:** **NOT COMPLETE**. No full per-capability audit, all-module UX acceptance or validation of every existing domain outcome was recorded.
- Earlier test claims in Codex: 1,606 unit/32 database-MCP checks; subsequent continuation recorded 1,607 unit/33 DB checks and focused responsive checks. These **predate some latest home/editor/energy changes**; do not represent a fresh green run.
- At the end, Codex had begun **energy hierarchy work**, including `src/features/energy/types/energy-distribution.ts`, its tests, a `parentApplianceId` relation and `prisma/migrations/20261108140000_energy_meter_branches/migration.sql`. Those files are present on GitHub, but end-to-end meter service/API/UI/configuration/MCP integration, chart refinement and combined testing were **not shown as completed**.

## Next engineering sequence

1. Audit the current `rework_features` files and rerun typecheck, Prisma validation, unit/DB/MCP tests and builds in a proper development checkout. Resolve any mid-edit inconsistencies before trusting an earlier report.
2. Finish the hierarchical energy model and visualization end-to-end, validating parent/child cycles, unknown/excess readings, deduplication, `Other` residual, sources, permissions and translations.
3. Test and finish map/editor, header, media and shopping sort/filter flows on actual phones/desktop with Storybook and browser journeys. Update old tests that expect room cycling to instead switch floors.
4. For every module, compare current service, UI, jobs, schema, tools and domain docs; map **each retained outcome** to a discoverable simplified flow and acceptance test. Recurring expenses/automations are explicit high-risk omissions in wireframes.
5. Complete Stage 4 across all features, then Stage 5 whole-app role/permission, bilingual, responsive, service/MCP, scheduling, data migration and integration parity. Deploy independently only after acceptance.

See [continuation work](continuation-work.md), [rollout checklist](rollout-checklist.md), [implementation report](implementation.md), the [full plan](plan.mdx) and the [finance domain guide](../../FINANCE.md).
