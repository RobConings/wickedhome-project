# One WickedHome — complete design plan and wireframes

This dossier replaces the earlier shopping-only layout proposal. It covers the whole application's navigation, feature ownership, linked records, shared components, playful visual identity and Home Assistant as a central part of the connected home.

All authored documentation is in English. **English is the default product language; Dutch is supported.** Both languages use household-friendly language and Belgian date/currency conventions. Existing technical identifiers keep their spelling.

- **[Complete interactive feature wireframes — 29 features, 78 screens](preview/all-feature-wireframes.html)** · [Coverage and instructions](preview/all-feature-wireframes-README.md) · [Screen manifest](preview/all-feature-coverage.json)
- **[Interactive mobile-first WickedHome workspaces — HTML prototype](preview/household-wireframes.html)** · [How to test and what is simulated](preview/household-wireframes-README.md) · [saved product design reference](preview/product-workspace-reference.svg)
- [Start here: sixteen annotated wireframes](preview/walkthrough.html)
- [Shopping journey at a glance](preview/wireframes/shopping-flow.png)
- [Related-record cards: phone and desktop](related-records.md)
- [Images, banners and view modes](visual-media.md)
- [Latest GitHub continuation and verification boundary](github-continuation-2026-11-08.md) · [Preserved legacy HTML/screenshots](legacy-wireframe-export/README.md)
- [Implemented slice and remaining work](implementation.md)
- [Revised implementation phases — feature-specific workflows and acceptance gates](implementation-phases.md)
- [Visual plan](plan.mdx)
- [Wireframe feedback and model-workspace redesign requirements (8 November)](wireframe-review-and-model-workspaces.md)
- [Feature preservation and outcome parity (mandatory redesign and release contract)](feature-preservation.md)
- [Ownership and architecture contracts](architecture-contracts.md)
- [AI and MCP workflow contract](ai-mcp-contract.md)
- [Complete page coverage](coverage.md)
- [English design catalogue](catalog.json) and [Dutch fixtures](catalog.nl.json)
- [React wireframes using the actual shared components](preview/main.tsx)

## Open the design atlas

From the project root:

```sh
python3 docs/plans/application-redesign/build_catalog.py
node docs/plans/application-redesign/preview.mjs
```

Start with **http://127.0.0.1:55450/walkthrough.html** for three annotated journeys plus a photos/view chapter, then open
**http://127.0.0.1:55450/?screen=project-detail&lang=en** for the full atlas.

The walkthrough also opens directly as a local HTML file with its adjacent screenshots. It explains sixteen
keyframes: the core shopping/project/home journeys and a dedicated chapter for recipe banners, project
covers, product photos, device photos and card/list views. It has step navigation, keyboard arrows and full-size image inspection.

The atlas contains 178 page and dialog variants, covering all 65 existing routes, 62 existing dialogs and 29 existing feature directories. Design-only subviews are explicitly identified; Catalogue and Purchases now have production public interfaces. Source files and extracted source field names are inspectable for each wireframe.

Search for a page or select a feature. Switch between desktop/mobile, light/dark and English/Dutch. Inspect empty, loading, error, access-denied and conflict states. Connected-home views additionally accept `state=offline` or `state=stale` in the URL. Follow relationships from a project to its requirements, product, purchase, expense and cash flow; the return link retains the originating record.

Shopping starts with the real single-selection `EntityPicker`: one shop or one saved group, with favourites and recent choices. The checklist provides large targets, Not now, quantity adjustments, extra products and completion. It demonstrates the intended simplicity across the application.

To leave section-specific feedback on the complete plan, run:

```sh
vplan docs/plans/application-redesign/plan.mdx --timeout 30m
```

This opens an interactive design review. Reviewing the plan does not deploy the illustrated changes.

## Actual component reuse

The atlas imports `AppShell`, `BrandMark`, `PageHeader`, `PageContainer`, `PageGrid`, `GeneralList`, `GeneralForm`, `GeneralFormDialog`, `EntityPicker`, `SegmentedControl`, `StatTile`, `IconChip`, `Progress`, `Avatar`, `TimelineList`, `ConfirmDialog`, `Card` and state components from the repository. These are real React compositions using the application's styling.

The catalogue is a design inventory, not a proposed universal production page renderer. Production continues to compose feature-owned screens and forms through public exports, following `docs/ARCHITECTURE.md`. Existing domain forms retain their conditional fields and validation during implementation.

`build_catalog.py` inventories routes, feature directories and dialog sources, then creates explicit EN/NL fixtures using existing translations and the reviewed bilingual phrase list. The preview's extra copy map is design-only. Production translations stay in their feature's existing locale namespaces.

## Scope and limitations

These are reviewable compositions and interaction examples with fictional household data. They make no production API calls, financial entries, stock movements or Home Assistant commands. Buttons illustrate navigation and local interaction; the illustrated product redesign has not been deployed.

Representative records demonstrate page patterns rather than simulating a complete database for every example row. Domain validation, persistent workflows and financial effects are implemented and verified separately against real owner services; see the implementation report. The atlas itself still uses fictional fixtures.

The original brand reference informs the colourful icons, warm surfaces and progress. Warm background overrides are confined to preview tokens; production styling is unchanged.

## Refresh the illustrated walkthrough

With the preview running:

```sh
node docs/plans/application-redesign/capture-walkthrough.mjs
node docs/plans/application-redesign/build-walkthrough.mjs
```

The captures use the actual shared React compositions with fictional data. Motion is disabled for stable
exports; the mobile header/navigation are placed in normal document flow for full-page image exports so they do not
obscure content midway through a tall screenshot. The interactive atlas retains its normal navigation.
The capture also produces a three-frame shopping-flow board for quick review.

## Verification and build

```sh
python3 docs/plans/application-redesign/build_catalog.py
npx tsc -p docs/plans/application-redesign/preview/tsconfig.json
node docs/plans/application-redesign/verify.mjs
node docs/plans/application-redesign/preview.mjs --build
node docs/plans/application-redesign/verify-walkthrough.mjs
node docs/plans/application-redesign/verify-media.mjs
node docs/plans/application-redesign/verify-implemented-patterns.mjs
node scripts/redesign-storybook-smoke.mjs # after npm run build-storybook
vplan check docs/plans/application-redesign/plan.mdx
```

Browser verification expects the atlas on port 55450 and Chrome/Chromium. It launches its own browser and does not request production credentials. Override the browser path with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if necessary. Atlas results are written to `verification.json`; walkthrough checks are written to
`walkthrough-verification.json`. The walkthrough verifier checks source/built assets, portable local HTML,
all sixteen frames on desktop/mobile, zoom and keyboard navigation. Temporary atlas screenshots and the built
preview are ignored by Git; the sixteen selected review images and the shopping-flow board belong to this dossier.

Media-specific checks are recorded in `media-verification.json`: banners, image cards, list thumbnails,
remembered view modes, product containment and missing/failed image fallbacks.

For deterministic built-atlas verification, serve `site/` locally and set `WH_DESIGN_URL` to that loopback address plus `WH_DESIGN_STATIC=1`. Built navigation uses the portable `index.html` entry point; developer-mode links retain the descriptive wireframe paths.
