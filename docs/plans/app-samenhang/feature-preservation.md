# Feature preservation and outcome parity — redesign contract

> **Non-negotiable:** WickedHome is being redesigned, not reduced to what happens to appear in the design atlas. An omitted wireframe, navigation item, or dialog is **not** a decision to remove an existing capability.

## What must survive

Preserve the **user's ability to achieve every currently supported outcome**, including the associated rules, automation, integrations, permissions and data. Preserve the meaning of records, their relationships, financial calculations, audit/history and important edge cases. This is **functional/outcome parity**, not screen-by-screen or click-by-click parity.

A redesign **may** remove unnecessary clicks, merge or rename views, consolidate forms, introduce progressive disclosure, streamline flows, move an action to a better context, or replace an old interaction with a simpler one **provided that**:
- Users can still discover and perform the complete task with appropriate permissions, on the devices they use.
- The end result, side effects, scheduled/background behaviour, validation and record/history semantics remain correct.
- Existing stored data and links are retained or explicitly migrated with verified equivalence; no silent data loss, duplicate money/stock effects or dropped relationships.
- Any formerly available advanced operation remains accessible when needed, even if the default path is deliberately simpler.
- Assistant/MCP/API and other supported entry points continue to use the appropriate domain services, with permissions and confirmations intact.

**Design intent:** make these capabilities *easier to use with the same outcome*. A one-to-one recreation of the old UI is **not** required, and preserving an awkward workflow simply because it existed is **not** the goal.

## Existing capabilities not represented in wireframes

The wireframe atlas is a **sample of journeys and layouts**, not an exhaustive requirements specification. Cross-reference [ROADMAP](../../ROADMAP.md), the existing [domain guides](../../README.md), [current implementation](implementation.md), and the **actual `main` and `rework_features` code** when planning each module. Where plans, code and the wireframes differ, investigate rather than silently deleting a feature. Do not assume that a feature is absent from the product just because the wireframe lacks it.

Examples to preserve, not a complete inventory:

| Area | Outcomes that must remain possible (simpler UI encouraged) |
|---|---|
| Expenses | **Create, manage, pause, resume and end recurring expenses** such as subscriptions, loans, insurance and other commitments; generate or view occurrences, handle due/paid history, direct debits, payment details, payer/splits, calendar/tasks, attachments and projects. Quick one-off expense logging remains possible. |
| Income and money | Recurring and one-off income, expected vs received, meal vouchers, joint accounts, transfers, contributions, balance adjustments, forecasts and reconciliation. |
| Tasks and automation | Recurring tasks, assignments, dependencies, materials, linked records, reminders, scheduled jobs, controls and run history. |
| Inventory, shopping and purchases | Minimum-stock rules, replenishment, linked recipes/tasks, product alternatives, counting/usage, store trips, receipts, purchase history, purpose allocations and correct stock/money effects. |
| Recipes and projects | Meal planning, ingredient needs and cooking; project tasks, materials, budgets, purchases, costs and documents. |
| Home and household | Places/floor plans, devices, HA capabilities and source state, energy, calendar overlays, household roles and contacts. |
| Supporting features | Documents and attachments, integrations, notifications, audit, assistant/MCP and household settings/security. |

This table lists **preservation obligations**, not a claim that each is fully represented in the atlas or already verified after redesign. Detailed behaviour belongs to the corresponding feature guide and tests.

## Required workflow for every redesigned module

1. **Inventory before designing.** Compare the currently implemented UI, API/services, jobs, data model, assistant/MCP tools and domain documentation to the proposed target. Record user-visible outcomes, automated effects, special cases and linked-feature dependencies; do not equate a route/dialog inventory with full coverage.
2. **Map old outcome to new access.** For each capability, record its current entry point, the intended simpler entry point or interaction, the unchanged outcome and relevant edge cases. If the wireframe omits it, **extend the design or specify a discoverable contextual/advanced path** rather than treating it as out of scope.
3. **Implement without regressions.** Keep owner-service contracts, permissions, data meaning, history and integrations. Make any necessary migration explicit, reversible where practical and tested. Simplification can change the workflow, not silently change its effects.
4. **Prove parity.** Verify real end-to-end tasks, including edit/delete/status changes, recurrence, jobs, permissions, web/API/assistant access and linked data where applicable. Validate phone/desktop and EN/NL access. A screenshot, linked button, smoke test or passing build alone does not prove outcome parity.
5. **Track gaps honestly.** Mark each outcome **retained and verified**, **redesigned and verified**, **open / unverified**, or **proposed for removal**. A proposed removal or meaningful loss of outcome needs **explicit product-owner approval**, not inference from a wireframe.

### Example: recurring expenses

A streamlined Finance screen might show upcoming payments and one **Manage recurring** entry rather than the old separate subscription/bills screens. That is acceptable *only if* the user can still create an obligation with an RRULE, choose payer and payment method, inspect/edit individual occurrences and templates, pause/resume/end it, preserve paid history, and get the expected payments, automations, calendar links and money/account effects. Verify the actual services and domain rules in [FINANCE.md](../../FINANCE.md), not only the mock-up.

## Release gate

A module is not accepted because its pages look like the atlas. It is accepted only when **all previously supported outcomes have an accessible, verified path** (or an explicitly approved exception) and the redesign's interaction goals are met. Track this alongside the [rollout checklist](rollout-checklist.md). Do not mark the whole redesign complete until every module passes this gate.

This contract guides design and implementation; it does not itself assert that a capability audit, code change, database migration or deployment has occurred.
