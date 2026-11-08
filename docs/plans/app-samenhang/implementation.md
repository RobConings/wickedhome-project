# Local redesign implementation — partial rollout

The shared foundation and main connected workflows are implemented in `/Users/robconings/WickedHome`; the complete application redesign is not finished. It has not been deployed to the household server. Existing local work, persisted identities, server configuration and the canonical `wickedhome-project` remote are preserved.

The atlas remains an illustrated design reference. Its separate screen IDs often represent states or related sections, rather than requiring another production route. The production inventory contains 65 routes and 29 feature directories; the atlas covers 178 page/dialog variants and 62 dialog source components.

## Outstanding scope

The full module-by-module conversion (Stage 4) and whole-application acceptance (Stage 5) remain incomplete. Calendar, Income, Money, Energy, Household, Contacts, Integrations, Settings/Auth, Notifications and the supporting areas retain much of their existing owner UI beneath the shared shell. The more extensively changed modules still need comparison against their complete capability and workflow specifications.

Remaining work includes module-specific information hierarchy, toolbars/filters/actions and shared-form adoption, remaining owner relationship contributions, and acceptance of the resulting complete workflows. Existing functionality being preserved and an entry-point smoke check passing are evidence of compatibility, not proof of a complete module redesign.

The passing counts below cover the implemented code and reference journeys. Previous documentation marked all phases complete too broadly; that status is corrected here and in the rollout checklist and visual plan.

## Shared experience

The shell groups Daily life, Finance, Our home, Library and System. Phones retain Home, Tasks, Shopping, Rooms and More. Overlapping URLs select one sidebar destination. Shared page identity supplies icons and breadcrumbs; safe originating links preserve filters and section context. Lists/cards retain GeneralList's view preference.

`RelatedRecordCards` provides coloured full-card links on projects, tasks, rooms, recipes, products, purchases, expenses and devices. Counts come from owners; absent counts are omitted. `RecordImage`, `ImageChoiceGrid` and Documents' `LinkedImagePicker` share imagery without changing live state or file ownership. Project/recipe banners remain. Devices now support attached photos. `RecordProgress` uses actual checklist facts and the existing UI progress primitive.

Forms use the established GeneralForm/GeneralFormDialog, money input and pickers. Shop-group membership uses the shared multi-picker. The phone entity-picker sheet restores focus to its trigger, including inside another dialog. New copy and common dialog close controls support English and Dutch; English is the unconfigured application default and account/device language preferences remain supported.

## Continuation: focused owner workspaces and maintenance

The next implementation pass adds one shared `SectionNavigation` with icon links, 44 px touch targets and an independently scrolling row. Shopping list/shop view/sessions and Energy use it. Income separates Overview, Expected, Received and Recurring sources; received history excludes future-dated records, while expected records retain edit/delete access. Person/kind/view state stays in the URL. Money retains its four owner views with the same navigation, URL-selected accounts and direct account-card links to their ledger. Expense links retain return context.

Settings now opens with descriptive icon cards and mounts one owner-contributed section at a time. `/settings?section=…` and existing `/settings#…` bookmarks/MCP/notification links work. Account/security, household, waste, weather, notifications, activity, jobs and integration content keep their owner actions and permissions. Phone checks also caught and corrected an intrinsic fieldset width in the household address form and wrapping in income rows.

Device maintenance is now a typed optional task relationship, with an additive migration. Device details receive the Tasks-owned panel; task forms receive the Devices-owned picker through routes. Users can plan, assign, repeat, complete and review real tasks; deleting a device retains tasks/history. Web and MCP validate the same household relationship, preserve it on unrelated edits and clear it explicitly. A database workflow test covers recurrence/history, foreign references, child restrictions, old completed tasks and device removal.

These changes advance Stage 4; they do not close the remaining module conversion or whole-application acceptance.

## Complete connected journey

1. Start shopping, choose one shop or saved group, and receive the current matching checklist. No name, checkbox matrix or separate recalculation is required. Advanced explicit planning remains available.
2. Use category/Out/Nearly out sections, Bought, Not now, product images and progress. Adjust quantity or a verified linked variant in an overlay; unrelated goods use Add extra. Practical jars/packs remain valid without a gram weight.
3. Buying records one acquisition and credits known stock once. Earlier selected variants, names and known selected quantities/units remain snapshots. A later variant change never rewrites previous goods.
4. Finish and review goods. Attach/match receipts, link a paid expense or record the actual payment. Shared payment forms manage retry identity. Date-only receipts use a conservative household-day boundary, avoiding future-noon timestamps and preserving count review.
5. Open Purchases from navigation, the visit, a product or a project. It presents existing acquisition IDs, receipts and expenses, including standalone Inventory acquisitions.
6. Assign acquired quantities to projects/household, with unassigned remainder visible. This does not reserve/consume stock or assign money.
7. Allocate the existing expense's integer cents to projects/household. The project budget uses its assigned share; the account retains the one gross expense. Invoice links, recurring-instance replacement, amount corrections, deleted projects and concurrent drafts are guarded.
8. Web and MCP call the same services. Actual MCP dispatch tests confirm purpose/cost writes, revisions, child/read-only restrictions, related context and unchanged stock/payment counts.

See [Purchases](../../PURCHASES.md) and the [AI/MCP contract](ai-mcp-contract.md) for contracts and stable tool names.

## Implemented changes and retained module capabilities

| Area | Result and retained capabilities |
|---|---|
| Home | Room/floor map, keyboard/touch room selection and cycling, saved geometry, live device markers, appliances, open tasks and current projects |
| Tasks | Existing scheduling, checklists, assignments, materials, dependencies, comments, repeat/completion/usage and documents; related room/project/material/document navigation |
| Shopping and Shops | One destination, saved-group management, automatic checklist, explicit planning, extras, partial quantities, location decisions, receipts/payments/history, lists and recurring products |
| Inventory and Catalogue | Existing stock/count/scan/minimum/usage workflows and product variants/photos; product context and acquisition history reuse current identities |
| Projects | Existing banners, list/cards, progress, tasks/materials, rooms, contacts, mail/documents and budget; filtered purchases and assigned expense shares |
| Expenses | Existing payment, payer splits, recurrence, loans, early repayment, QR/reference details, history and attachments; cost shares and linked visit navigation |
| Income and Money | Existing source/expected/received distinctions, vouchers, accounts, contributions, transfers, adjustments, forecasts and reconciliation; shared shell and contextual record links |
| Recipes | Existing cover/banner and list/cards, favourites, ingredient links, planning, cooking/timers and actual stock use; related ingredients/steps/documents |
| Places | Rooms/zones/floors and editing remain first class; interactive room plan and owner-contributed projects, devices, tasks, shopping, stock and appliances |
| Devices and HA | Existing profiles, fields, rules, manual/live state, placement and source mapping; attached photos, capability-backed commands and scenes. Unknown/offline sources offer no command |
| Calendar and Energy | Existing events, source overlays, recurrence, measurements, imports, appliances and tariffs; specialised workspaces retain the shared shell and page identity |
| Household and Contacts | Existing profiles, residents, accounts/invitations/roles and contact/project relationships; shared navigation and recognisable owner controls |
| Documents | Existing files, folders, trash, attachments and external-source ownership; shared attached-image selection and related context |
| Integrations, Settings and Auth | Existing connection/import review, account/security and owner-specific settings/forms remain; grouped navigation and consistent identity |
| Assistant and Notifications | Existing conversations, access/confirmation policy, source links and notification preferences; current guides, purchase/cost/capability tools and post-commit refresh |
| Automations, Audit, Waste and Weather | Existing Settings/dashboard/calendar entry points, jobs/history, traceable actions, source availability and domain contributions remain |

Shared navigation/presentation is applied across the app. Specialised canvases, cooking, chat, finance and editors keep their domain interactions instead of being forced into a generic page renderer.

## Data and release boundary

Four additive migrations cover acquired-variant history, device photos/expense shares, selected quantity snapshots and acquired-goods purpose shares. They preserve existing IDs and history. All migrations were applied to a disposable PostgreSQL test database; production has not been migrated by this task.

The recent Purchases list returns up to 200 matching visit purchases and 200 standalone acquisitions. Existing visit history remains available through Shopping. A physical-device/real-connection check belongs to deployment: local validation simulates HA entity capabilities and does not send commands to household hardware. No universal product-project field, inferred reservation, exact task map coordinate or unknown package weight is invented.

## Validation evidence

- Unit suite: **1,606 passed**, with **32 opt-in database/MCP cases** run separately.
- Real PostgreSQL/MCP integration: **32 passed**. Includes concurrent buying, receipt/payment retries, practical containers, selected-versus-stock units, foreign households, variant history, goods purpose, expense allocation, budget/account invariants and MCP scopes.
- Migration preservation: **103 legacy tables and 14 populated records unchanged**, with new purpose fields unset rather than guessed.
- Real API/browser journey: two phone users, room map/cycling/keyboard, inline Adjust/conflict drafts, forecast filters, extras, close, receipt/payment replay, reconnect, saved-group start, goods/cost allocation, concurrent allocation draft preservation and return context.
- Module entry checks: **60** phone/desktop/language/theme combinations, including all 30 top-level and supporting navigation destinations; one active desktop sidebar entry and no horizontal overflow.
- Type/layer lint, client/server build and Storybook build pass. CI runs the existing database/MCP/migration/browser checks and now builds the shared component catalogue.
- Atlas: **398** responsive, state and related-navigation checks; media: **13** cases; implemented room/Adjust patterns: **12** cases.
- Component browser: **86** English/light and Dutch/dark cases, including 320px phones, no script errors, horizontal overflow or production API requests. See `component-verification.json`.
- The refreshed illustrated walkthrough uses **16** locally captured fictional frames; **64** checks cover source/built assets, portable local HTML, keyboard navigation and zoom.
