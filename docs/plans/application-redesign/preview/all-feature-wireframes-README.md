# Complete WickedHome feature wireframes

This standalone [interactive HTML atlas](all-feature-wireframes.html) expands the product-workspace prototype to **29 feature owners and 78 linked example screens**. It is a **design preview**, not a production implementation or a claim that all 65 existing routes and 62 dialogs have been reproduced.

## How to review

Download/open `all-feature-wireframes.html` in a browser (it has no external dependencies). Use the **All features** control at the top or **More** on mobile. Choose a feature, switch between **Details** (default) and **Overview**, open related records, and use the two contextual action groups: primary daily action and primary management action, each with dropdown options. The prototype starts on the Boni Halfvolle Melk 1L product example.

Mobile uses two action rows. Product stock uses household-friendly quantities (for example **3 bottles**), not per-room inventory splits. Product information, product details, notes, recipe/shopping/purchase/alternative links, colourful icons, full media regions and cross-record navigation follow the owner's approved design direction.

## Coverage and sample interactions

See the [29-feature screen manifest](all-feature-coverage.json) for every workspace. Examples include the shopping trip checklist and low-stock filters; recipes/cooking; recurring expense templates and occurrences; income and meal vouchers; account transfers, corrections and contributions; project budgets; calendar month navigation and overlays; floor switching; Home Assistant entity states; energy parent/child meters and unallocated **Other**; documents and Drive; notifications, automations, audit history and settings.

The prototype keeps the existing feature-ownership and outcome-parity requirements from [feature preservation](../feature-preservation.md) and [model workspaces](../wireframe-review-and-model-workspaces.md). Missing detail in a mock screen is **not permission to remove a capability** in the real application.

## Limitations and verification

All data and transactions shown are **fictional design examples**. Actions can open sample UI; they do not write household data, sync calendars, run jobs, call MCP, or connect to HA, Gmail or bank accounts. The full app's domain rules and permissions still require implementation-level acceptance.

**Local prototype checks (8 Nov 2026):** 78 Details screens and 78 Overview screens at both 390px and 1440px, 29 feature groups, no browser script errors or horizontal overflow. Example checks covered linked record navigation, Details/Overview switching, calendar months, floor switching, cooking step changes, shopping checkboxes and energy carrier switching. These are **prototype-only checks**, not full app/production tests.

[Return to redesign dossier](../README.md) · [Product design reference](product-workspace-reference.svg)
