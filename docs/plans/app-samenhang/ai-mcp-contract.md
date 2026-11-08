# AI and MCP contract for the unified application

This contract describes the implemented local redesign and its design references. The authoritative current tool definitions remain `ai/skills/**/tools.ts`, their `guide.md` files and the registration layer. Read `app_help` before using unfamiliar workflows. Do not infer a new tool from a wireframe button.

## One domain model for web and AI

| Concept | Meaning for both interfaces |
|---|---|
| Product | Stable catalogue identity, unit and verified alternatives |
| Stock | Goods actually present at a location |
| Shopping need | Something the household may want to acquire, with its source |
| Shopping trip | A visit/checklist selected from existing needs |
| Purchase | Goods actually acquired, with quantities and provenance |
| Expense | Money due/paid, linked to the purchase where appropriate |
| Allocation | A share of an existing line/cost assigned to project or household |
| Project | Goal and context; consumes owner-provided tasks, needs and cost views |
| Live state | External observation with source, timestamp and availability |

One jar is one jar. Weight is unnecessary unless a requested conversion actually needs it. Do not demand precision the household does not use. Unknown conversion is not zero stock.

Below minimum means Out. Essential at minimum also means Out; nonessential at minimum means Nearly out. These are replenishment forecasts, not proof of zero stock. Preserve the existing `stockNeed` values and minimums; users decide what to acquire.

## Context supplied to an assistant

The implementation must expose a typed, access-filtered context containing:

- current locale, household, role and permitted actions;
- page/record type, canonical IDs and owner feature;
- active filters, selected project/space/shop destination and originating record;
- relevant quantities, units, currency, statuses and their meaning;
- latest record/line revisions and source/action identities where applicable;
- external source, observation time and unknown/stale/offline state;
- related record references and supported next actions.

Only include authorised records and totals. A hidden financial row cannot leak through a related counter or summary. Context supports retrieval; it is not authority to mutate or proof that a cached value remains current.

## Existing tool families and current presentation

| User goal | Existing tools / source | Redesign requirement |
|---|---|---|
| Find products and stock | `inventory.products`, `inventory.stock`, `inventory.low_stock` | Reuse IDs and actual household units |
| Understand shopping needs | `shopping.list` | Retain source and destination context; describe Out/Nearly out correctly |
| Start or resume trip | Exported session tools such as `shopping_plan_visit`, `shopping_start_session`, `shopping_sessions`, `shopping_session` | `selection: matching` plus one shop/group builds the current checklist automatically |
| Record acquired goods | Session item action or `inventory.record_purchase_batch` | Use the appropriate central acquisition path once |
| Attach receipt | `shopping_session_attach_receipt`, `shopping_session_match_receipt` | Link existing purchases before creating missing acquisitions |
| Link payment | `shopping_payment_options`, `shopping_session_record_payment` | Reuse expense, payer and account; preserve stable payment reference |
| Understand project | `projects.details` and project list/link/material tools | Expose typed relationships and consistent allocation totals |
| Use stock for task | Inventory usage action with task/project context | Validate actual location and quantity; never infer a reservation |
| Understand expense | `expenses.details` and owner payment tools | Distinguish expense, acquisition, allocation and account effects |
| Operate connected home | Existing device/alarm/HA capabilities and permissions | Read freshness and supported capabilities; retain confirmation boundaries |

Names shown with dots are internal registry names; underscore names are exported MCP names. Verify actual registration before invocation. Catalogue/Purchases public interfaces and related-record context now wrap existing owner services. No second product catalogue, stock ledger or account ledger is created.

## Implemented quantity and variant adjustment

`shopping_session_update_item` now accepts `productId` for the current product or a verified linked variant sharing its canonical stock owner. Quantity/product changes alone acquire nothing. Existing item/requirement IDs and earlier acquisition snapshots remain intact. Read `shopping_session` for current item revisions and acquisition-line `productId`/name; use `shopping_session_add_item` for unrelated extras.

## Shopping action sequence

1. Resolve the requested shop **or saved group** by a recognisable name. Ask only if genuinely ambiguous. A saved group already defines its shops.
2. Read current needs and create/resume the session using existing requirement identities. The user need not run a separate technical recalculation step.
3. Record bought, skipped, quantity adjustments, a verified linked alternative or an extra product through the owner. Read the latest item revision before changing it.
4. Treat `purchasedQuantity` as a total, not an increment. Keep a stable operation identity and payload when retrying the same action. Re-read on conflict.
5. Resolve open rows before closing. Skipping does not acquire goods or increase stock.
6. A later receipt links stable printed lines to prior acquisitions; create only genuinely missing purchases.
7. Link the existing/new expense with a stable payment reference. Do not infer paid money from stock quantities.
8. Explain what was acquired, what was skipped, what stock changed and what still needs a receipt/payment/location. Report only confirmed results.

The current session model exposes explicit planning and selection capabilities. Simplifying the default web/AI path requires updating the service-facing orchestration and guides together; the wireframe alone does not change these tools.

## Financial and stock invariants

- Do not record a second purchase because an expense or receipt is attached later.
- Do not increase stock through both a session item and a separate purchase action for the same goods.
- Allocate the €35 project share of a €45 receipt without creating a second €35 bank debit.
- Do not count salary income again as new income when its household contribution reaches an account.
- Keep estimates, unpaid commitments, actual costs and confirmed cash movements distinguishable.
- Preserve source identities on edits, returns, refunds, allocations and unlinking.
- Missing amount, unknown conversion or inaccessible record is not a numeric zero.
- Other users' changes and MCP writes reach the same post-commit invalidation mechanism as the web app.

## Language and help

Documentation and source help are authored in English. The app defaults to English and supports Dutch. Respond in the user's chosen language; keep identifiers and persisted statuses language-neutral. Explain “start a shopping trip” / “winkelsessie starten” through the same underlying flow. Product names, receipt text and other user-authored content are preserved rather than automatically renamed when switching language.

Update `app_help`, affected `guide.md` files, tool descriptions, screen-context documentation and examples in the same implementation change. New navigation must not make older records or history undiscoverable.

## Required acceptance cases

| Scenario | Evidence required |
|---|---|
| English versus Dutch | Same IDs, quantities, totals, permissions and actions |
| Shop versus saved group | One destination; no duplicate selection or copied needs |
| Retry same purchased quantity | One acquisition and one stock credit |
| Concurrent item update | Conflict preserves input; fresh revision resolves it |
| Receipt added after completion | Links existing goods; no second stock movement |
| Extra product or verified alternative | Preserves actual product identity, unit, purpose and quantity |
| Mixed project/household receipt | Allocation reconciles; account debit occurs once |
| Expected income versus receipt | Expected amount never silently counted as received |
| Partial payment/refund | Source-linked correction updates account and project views correctly |
| Sensor unavailable or stale | No fabricated current state or unsupported command |
| Restricted financial context | Rows, counts, summaries and tools apply the same access rules |

Extend the existing real-service/MCP integration tests and assistant eval scenarios for these journeys. Wireframe browser tests prove composition and navigation only; they do not replace domain or authorisation evidence.

## Image context

A record's authorised cover/photo reference may accompany its identity in screen context. Images do not
change canonical IDs, units, quantities, budget or live device state. A project cover is not evidence of
a completed task; a product photo is not evidence of stock; a device photo is not a current observation.
Both card and list modes expose the same records and actions. Preserve existing cover references when
changing layouts. Device photos now use the same attached-image contract as projects/recipes; Devices validates its selected Documents reference.

## Implemented goods, cost and connected-home parity

- `purchases_list`/`purchases_details` read existing visit purchases and standalone acquisitions. Preserve kind/id, original selected quantity/unit and credited stock quantity/unit. Unknown historical conversions stay unknown.
- `purchases_goods_allocation` reads an acquisition ID, quantity/unit, shares and integer revision. `purchases_allocate_goods` replaces deliberate purpose quantities; remainder stays unassigned. It never consumes/reserves stock or assigns money.
- `expenses_project_allocation` reads current expense shares/revision. `expenses_allocate_projects` assigns integer euro cents on that same expense with mandatory financial confirmation. Project budgets use the shares; the account uses the gross payment once.
- `inventory_product_context` reads existing needs, linked tasks and projects, including deliberate purchase purposes. A product gains no universal project field.
- `devices_capabilities` reads linked HA entity actions, ranges, units, source state and update time. `devices_switch`/`devices_climate` use the same server capability validation as web controls. Unknown/offline entities expose no command. `devices_set_cover` only selects an attached household image.
- Child/write-scope restrictions and foreign-household refusal are tested through actual MCP dispatch and owner services. The integration suite asserts unchanged stock movements and expense counts after purpose/cost allocation.

## Device maintenance relationship

Resolve a Device before using `tasks_add` or `tasks_update` with `device`; use type `maintenance` for maintenance work. The Tasks owner validates household references and retains the normal assignments, recurrence, dependencies, materials and completion service. `tasks_list_open` can filter by device; `filter: done` then includes closed tasks of any age, while summary counters retain their household scope. Recurring occurrence history is available through `tasks_details` (the latest entries), not inferred from whether the recurring task remains open. Omit device on edit to retain it; `noDevice: true` unlinks explicitly. Device deletion retains tasks/history with a null relationship. These tools never imply a physical HA command.
