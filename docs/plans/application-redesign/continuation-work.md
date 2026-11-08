# Active implementation continuation — 8 November 2026

The full rollout is still in progress; do not infer completion from entry-point checks. An intermediate work-in-progress version was pushed to `rework_features`; this does **not** mean it was tested as a whole or deployed to the server. See the [compact Codex session handoff](codex-session-handoff.md) and [feature preservation contract](feature-preservation.md) before continuing.

## Latest user review — supplied local wireframe exports

The product owner supplied `app-samenhang.zip` (local vplan HTML, built preview and 27 desktop/mobile screenshots) as the latest visual reference. **Do not treat the current atlas as approved or complete.** The reference is not checked into GitHub. Review and iteration requirements are documented in [wireframe review and model workspaces](wireframe-review-and-model-workspaces.md): generic quick actions must be reconsidered, card imagery should visually occupy its media slot, all existing finance and recurrence functionality must receive complete access paths, and every first-class business record needs its own Odoo-like workspace and meaningful links to related models. This requires an end-to-end capability/relationship audit, not simply more counters.

## Latest user requirements

- Every page uses the same header Back position, including exact originating record/filter context.
- Images must have useful size: larger row thumbnails, full-width card media for products/devices, retained recipe/project banners. Avoid padding that reduces products to tiny icons.
- Grocery lists, shop view and shopping trips retain category/name sorting and Out/Nearly out filtering. Also offer Out + nearly out together. Name sorting must be globally alphabetical rather than re-grouped by urgency.
- Calendar retains day/week/month behaviour and navigation.
- Explore home is a full-screen floor map. Switch floors, not rooms. Click rooms/devices/work markers for an inspector (desktop sidebar, phone sheet) with information/actions/detail CTA.
- A space opens with its floor plan as the main element. Retain drawing/editing and allow device/task creation in the editor. Room task markers describe room relationships rather than invented physical positions.
- Devices include cameras, alarms, smoke detection, temperature, floor heating/radiators and other real HA capabilities.
- Energy needs a graphical grid/solar/home/battery/gas flow in addition to retained charts. Distinguish energy over a period from live power. Metered devices/sub-meters branch further; every branch has Other as its unassigned residual. Missing readings are unknown and overlapping parent/child readings must not be summed twice.

## Implemented in this continuation, awaiting final combined acceptance

Shared icon section navigation; focused Income views and URL filters; Money view/account URLs and account-to-ledger links; focused Settings cards/sections and legacy hash compatibility; typed device-maintenance task link, migration and MCP parity; shared phone button targets; consistent header Back migration; larger product/device/stock card media; shared shopping sort controls and combined low-stock filter; full-floor home explorer/room inspector contribution; space plan promotion; editor task/device owner contributions.

Earlier focused verification passed 1,607 unit tests, 33 integration tests, migration preservation (103 tables/14 populated records), 122 EN/NL light/dark component renders with owner navigation checks, and the previous two-phone shopping journey/60 entry checks. New header/media/sorting/map/editor changes made after those runs still require updated stories, browser assertions and complete reruns. The old browser test expects room cycling and must be updated to floor-only map selection. Do not claim those later changes already passed.

## Work still being completed

- Finish map/editor acceptance and edge cases, new component stories, header/navigation/media/sort tests, docs/MCP examples.
- Implement the energy flow and typed parent/child metering model/validation, residual calculation, source/coverage details, usable configuration and MCP equivalents. An initial energy hierarchy helper/test and `20261108140000_energy_meter_branches` migration have since been added to the branch; their complete service/API/UI/MCP integration and combined verification are still pending.
- Finish the remaining complete-module conversion/acceptance recorded in rollout-checklist.md. Broad phases remain open.

Disposable local PostgreSQL: /tmp/wickedhome-shopping-pg.cpBVk9, 127.0.0.1:55439, wickedhome_shopping_test, role wickedhome_test (currently started by this task). Only this disposable DB receives migrations. A task-owned Python Storybook preview is on 127.0.0.1:55452 (exec session 76449); shut it down when no longer needed. Do not stop the older user-facing review preview on 55450. Do not deploy, commit, push or edit the SMB/server copy.
