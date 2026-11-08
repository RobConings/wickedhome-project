# Documentation review — 7–8 November 2026

## Scope

The review covers project-owned Markdown/MDX in `docs/`, `ai/` and `.storybook/docs/`, including historical plans, runtime skill guides and the application-wide design dossier. Installed third-party skill packages, generated API code and translation resources are separate from this documentation scope.

English is the documentation/source-copy language. Dutch remains intentionally present in `app_help` discovery keywords, `nl` translation examples, source CSV headers/status values and user/source names. Those values must not be translated as if they were explanatory prose.

## Corrections

| Finding | Result |
|---|---|
| Shopping report and two older plans were still Dutch | Full English versions, including diagrams, phase descriptions, tables and operational MCP guidance |
| AI runtime guides used Dutch request examples inside otherwise English text | Examples and explanations translated; tool names, arguments, permissions and workflow meanings preserved |
| Architecture and feature instructions required all work over SMB/on the server | Local development and server deployment are now separate; machine-specific dependencies stay in their own environment |
| Old phase reports sounded like current deployment status | Historical validation and current server revision are explicitly distinguished |
| Roadmap listed existing Google/HA capabilities as future scope | Scope and historical foundation are distinguished from the next cross-feature redesign sequence |
| A `home` feature and scattered ownership descriptions conflicted with source folders | Home Assistant and the implemented Catalogue/Purchases public interfaces have explicit ownership |
| Existing reports and target wireframes could be mistaken for the same interface | The implemented one-destination journey and illustrative atlas states are distinguished from deployment |
| A large atlas made the intended experience hard to grasp | Sixteen annotated keyframes explain four connected journeys |
| Completion reused open-shopping filters and unrelated sample rows | The wireframe now reviews acquired/skipped goods, stock status and optional receipt/expense links |

## Contracts checked during rereading

- Shared components remain domain-independent; cross-feature browser imports use public indexes.
- A page hosts related contributions without taking ownership of their data.
- Actual stock, task requirements and reservations retain different meanings.
- Purchases, stock movements, receipt evidence, expenses, project shares and account movements are not interchangeable.
- Existing project invoice/material links and session payment links are different; a combined allocation chain still needs implementation evidence.
- Household units do not require unnecessary gram weights.
- Web and MCP share domain services, revisions, stable source identities and post-commit events.
- Live Home Assistant state keeps source/freshness/capabilities; existing alarm/AI boundaries remain in force.
- Both languages share Belgian date/currency conventions; translating docs does not change persisted IDs or account preferences.

## Remaining distinctions

The atlas is a fictional design preview. It is not a deployed rewrite or a full database simulator. Energy tariff/cost cards are proposed; current energy tools report measured usage and freshness. Catalogue/Purchases ownership starts with contracts over existing records rather than duplicate tables. Historical production/integration test counts remain labelled as historical; documentation/gallery checks are reported separately.

Repository source and current tool schemas remain authoritative for implemented behaviour. Deployment/runbook observations are dated records and require environment inspection before operational use.

## Validation for this documentation and wireframe revision

- Language/reference audit: 66 project-owned Markdown/MDX files and 145 local links; no missing link targets.
- AI/MCP documentation contracts: 33 passing tests, including guide-size limits, published help and English/Dutch routing.
- Atlas sweep: 390 checked views/states plus eight related-navigation cases with no browser errors, horizontal overflow or production API calls.
- Illustrated walkthrough: 64 screen checks across source, build and local HTML; images, desktop/mobile layouts, zoom and keyboard navigation pass.
- Targeted journeys: language switching, shop-dependent checklist and shared-picker group composition pass.
- Preview type checking, lint, production build and all three visual-plan validators pass.

The [implementation status](plans/app-samenhang/implementation.md) separates the new production code from the remaining target design. The current implementation has also passed 1,603 unit tests, 25 real PostgreSQL session/MCP integration tests and the real API/mobile browser journey. Historical results in older implementation reports remain historical.

## Implemented room and interaction patterns

Home now includes the existing floor-plan viewer, floor/room navigation, room work markers and owner-contributed appliances, open tasks and projects. Project summaries and the atlas reuse the new production `RelatedRecordCards`. Session Adjust uses the existing shared form/dialog/picker and accepts only linked variants; acquisition snapshots preserve earlier product names and identities. Twelve additional English/Dutch checks at 320/390/1440 px verify the actual components in the atlas without API requests.

## Image-led view refinement

Recipe/project cover banners and generous photo cards are explicit retained requirements. Product/device
photos, compact list thumbnails and remembered card/list choices are documented in the media contract.
The walkthrough now has sixteen selected screens, including the Photos and views chapter. Thirteen
media-specific browser cases verify cover sizing, both view modes, retained records, saved preferences,
product contain treatment and missing/failed image fallbacks. Device photo persistence remains proposed
owner work; the example assets do not change household data.

The completed local redesign has current source/English-Dutch copy, MCP guides, 65-route/29-feature coverage and a separate [implementation report](plans/app-samenhang/implementation.md). Migration preservation, actual owner/MCP workflows, component responsiveness and real browser journeys validate the contracts independently of fictional wireframes.
