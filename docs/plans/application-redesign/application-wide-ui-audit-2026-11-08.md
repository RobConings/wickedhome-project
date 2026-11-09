# Application-wide UI and feature-parity audit — 8 November 2026

**Status: in progress; not approved or release-ready.** Source-level review of the `rework_features` branch, aligned with `feature-preservation.md`, `wireframe-review-and-model-workspaces.md`, `application-outcomes.md` and the product workspace reference. User screenshots were taken **before** some current branch changes and must not be treated as proof that the latest code still has the same defect.

## Non-negotiable shared page contract

1. Every normal application screen uses **one** shared `PageHeader` with the **Back** control next to the title (not a separate top row), usable origin/parent navigation and actions aligned to the title row at desktop widths. Auth/login/setup and immersive full-screen tools may have documented exceptions.
2. An owner workspace exposes genuinely relevant primary actions in the header. Where two contextual actions exist, prefer the shared `SplitAction` pair with usable dropdowns, preserving original forms and permission checks. **Do not invent a meaningless second action** purely to hit a count.
3. **Navigation tabs are tabs**: in-page panels use Radix `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`; URL-backed sections use the shared visual treatment with proper links and `aria-current`. Filters, sort order, status chips and list/grid display switches must not impersonate page tabs.
4. A related-record card shows at most **five representative records** before an explicit **View all** owner-filtered destination. Counts refer to all matching records, not preview length. Filter by stable owner IDs and family/relationships server-side where needed; never invent search terms, use unfiltered destinations, or suppress records silently when an owner filter isn't implemented.
5. All cards/lists use authentic saved media (`RecordImage`, `ShopLogo`) with readable fallback, correct contain/cover, full-card links where appropriate and meaningful empty/loading/error states.
6. Use the whole content width. Two-column page grids require **two intended columns**; don't create an empty sidebar. Avoid repeating the same information in chip navigation, cards, and verbose sections. Mobile first (320/390 px); 1440 px desktop.
7. Owner features remain functional: quantity reconciliation, duplicate-prevention, shared-stock alternatives, source provenance, recurrence/payment history, permissions, deep links, and keyboard access all require regression coverage.

## Approved responsive composition: product-reference screenshot (8 November)

**Never use arbitrary flex-wrap to put the title beside two main action buttons on phones.** This caused the real 320–390 CSS-pixel shopping screen to squeeze "Boodschappen" into a narrow column, with the description breaking almost word-by-word. The visual reference supplied in the review shows intentionally different mobile and desktop arrangements.

- **Phone (< 640px):** back arrow and identity icon on the title line, a readable title **without the low-value description** (hide it on phone widths), then one centered full-width split-action **per row** (two rows for two relevant CTAs), then full-width section tabs and immediately the meaningful content. Product record hero: image, title/identity, core stats, action rows, tabs, details. No interleaved desktop action column.
- **Tablet (640–1279px):** preserve title width by placing actions below it; actions may sit next to each other if they fit without compressing identity text. Show descriptions from 768px only when there are no title actions. Never assume viewport CSS pixels equal physical screenshot pixels.
- **Desktop (>= 1280px):** title and action controls share a row, title to the left and actions right, retaining a meaningful minimum content width. Non-essential header descriptions yield to actions and appear with header actions only from 1536px up. On product records the image can remain in its own left hero column, with stats beneath the title/action header.
- **Shared implementation:** `PageHeader` owns headline layout, `PageBackButton` owns return context, `SplitAction` owns action-dropdown semantics, and `RecordWorkspaceTabs`/`SectionNavigation` own the appropriate tab semantics. Feature screens must not reinvent the responsive breakpoints.
- **Executable regression checks:** `stories/shared/page-header.stories.tsx` provides the long Dutch shopping headline with two split actions; `scripts/shopping-browser-smoke.mjs` asserts mobile CTA ordering, low-priority description visibility by breakpoint and desktop action placement on the shopping page, and header row placement across top-level modules at phone and desktop sizes.

A screenshot showing no horizontal overflow is **not enough**: the former bad layout fit horizontally by collapsing the title and creating dozens of unwanted line breaks. Verify actual element geometry and visual appearance. Browser CI and human phone/desktop review remain required.

## Findings and implementation status

| Priority | Area | Source and concrete finding | Status / acceptance |
|---|---|---|---|
| P0 | Release | Earlier GitHub CI on the session redesign had a browser navigation failure; passing type checks is not browser acceptance. | **Open.** Check latest CI and real browser navigation before deployment. |
| P1 | Inventory / products | `inventory-screen.tsx` and `products-screen.tsx` had separate top-level destinations, without shared tabs. | **Code updated** with `src/components/shared/inventory-navigation.tsx` on both pages. Validate navigation, active state, origin and 320/390/1440 px. |
| P1 | Product ↔ recipes | `product-context-panels.tsx` listed every linked recipe in a tall card (46 in the screenshot) with no owner-filtered destination. | **Code updated** to show 5 plus linked View all. `recipes.service.ts` resolves the canonical shared-stock family with household scoping; `recipesLoader` and recipe list use URL `productId`. Requires browser + API/DB test. |
| P1 | Places | `place-detail-screen.tsx` wrapped one content section in `PageGrid columns="main-sidebar"`, reserving a completely empty third of desktop width. | **Code updated** to fill the full page width. Still needs information-hierarchy/empty-card design acceptance. |
| P1 | Expenses | `expenses-screen.tsx` used `SegmentedControl` (radio options) for primary page views, unlike product workspace tabs. | **Code updated** with real Radix tabs and shared page-tab tokens. Payer filters remain filters. Browser keyboard/URL/back tests open. |
| P1 | Expenses | Two title actions existed as separate buttons, without dropdowns. | **Code updated** with shared `SplitAction`, original modal triggers retained. Dropdown relevance and adaptive header placement require visual acceptance. |
| P1 | Every owner detail | Product, recurring finance, shopping session and several other records have different detail/overview layout strategies; many still render all relationship sections inline. | **Open.** Audit per owner record, identify meaningful Details vs Overview sections and avoid introducing duplicated navigation. |
| P1 | Related records | `ProductContextPanels` now previews five shopping needs (with `/shopping?productId=…`) and five recipes (with `/recipes?tab=all&productId=…`). Tasks/projects and other owner panels can still render unbounded relationships because exact owner filters are missing in places. | **Partially updated.** Implement each remaining destination's real owner-filter API/URL **before** truncating its preview. Purchase history already has a product route. |
| P1 | Room relationships | Room has six contributed cards and shortcut cards, often empty, creating long repetitive screens. | **Open.** Use meaningful empty/linked states, minimize duplicate navigation, verify panel count accuracy and direct owner links. |
| P2 | List view styling | `recipes-screen.tsx`, income, money, projects and notifications mix Radix tabs, `SectionNavigation` and `SegmentedControl`. Some segmented switches genuinely control filters or display mode; others change substantial views. | **Open classification per screen.** Only migrate actual view navigation; preserve radio semantics for genuine filters/modes. |
| P2 | Media | Product images/recipe covers/shop logos have reusable components but detail pages differ in layout and missing-image fallbacks. | **Open visual acceptance** with real image, missing image, large/small image, dark/light. |
| P2 | Shared actions | Most detail pages use `PageHeader`, but many owners still have a mixture of direct buttons, forms, menus and inline destructive controls. | **Open.** Assess contextual workflows; avoid forced two-button rules for read-only/child pages. |
| P2 | Documentation | Broad implementation status was marked delivered without equivalent browser/feature-outcome evidence. | **Open.** Never mark done solely from source presence or a route count. Update owner-level acceptance evidence with failures. |

## Audit coverage and honest limits

- Reviewed the screen inventory under `src/features/*/screens` (64 screen files identified), with targeted source inspection of inventory, product, catalogue context, recipes, expenses, shopping sessions, places and common navigation/layout primitives. A targeted static scan examined header/tab/split-action/segmented/grid usage on representative screen files in each major domain; **this is not yet a complete hand-executed UI test of all 64 pages**.
- Product and shop owner APIs were traced for stable `productId` filtering. Household-scoped source queries are essential: using the product **name** as search would be incorrect for aliases/variants.
- Other owners to validate explicitly: tasks, projects, calendar, purchases, money, household, devices, energy, recipes, shops, contacts, documents, income, integrations, notifications, settings, Home Assistant, assistant and the dashboard.
- Known capability preservation remains governed by `feature-preservation.md` and `application-outcomes.md`; do not replace them with this visual audit.

## Acceptance matrix for each redesigned screen

Record for each screen/owner: route; headline actions and role permissions; back/origin link; tab type and active state; source of counts; each related-card source and preview limit; exact View all destination; real logo/photo/fallback; 320/390/1440 screenshots EN/NL light/dark; keyboard/touch; loading/empty/error; data mutation and historical correctness; relevant automated test; human visual approval.

**Release decision remains blocked** until the current branch passes CI, relevant browser/end-to-end scenarios, and product-owner visual acceptance. Screen-source edits marked above are implementation, **not** passed acceptance.
