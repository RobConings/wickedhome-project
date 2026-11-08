# WickedHome — interactive household wireframes

**Status: clickable design prototype, NOT production UI or an accepted feature audit.** Created 8 November 2026 from the approved direction of the product-workspace mockup and subsequent user feedback. This is a standalone HTML document: no build, backend, credentials, migration, deployment or external assets are required.

- [Open the interactive wireframes](household-wireframes.html)
- [Saved product-workspace visual reference](product-workspace-reference.svg)
- [Full product-owner feedback and model-workspace requirements](../wireframe-review-and-model-workspaces.md)
- [Feature/outcome preservation contract](../feature-preservation.md)
- [Implementation and rollout status](../rollout-checklist.md)

## How to try it

Open `docs/plans/application-redesign/preview/household-wireframes.html` directly in your browser. The prototype includes a **Phone preview** control for narrow-width design testing, and the layout also adapts naturally to a real phone or resized browser window. The **All screens** button opens a picker of example screens. Sidebar, product links, relationship cards, **Details / Overview** tabs, dropdown actions, navigation history, shopping checkboxes and form/dialog shells are interactive examples.

You can also serve the repository locally if preferred:

```sh
python3 -m http.server 55450
# Open http://localhost:55450/docs/plans/application-redesign/preview/household-wireframes.html
```

## Product page: approved layout contract

1. **Top block:** product image on the left, identity/status/description and four compact summary cards (stock in bottles, shopping, recipes, purchases) on the right on desktop. On mobile, these adapt into a vertical product header and a four-column compact metric row.
2. **Two split action groups** near the top: **Add to shopping list** (usage actions in its dropdown, e.g. adjust stock) and **Edit product** (management actions in its dropdown, e.g. link alternative or archive). Both are prominent, and on mobile each gets its own row. Dropdowns overlay content. Do not shift page content to illustrate open menus.
3. **Exactly two top-level content tabs: Details (default) and Overview.** Do not duplicate model-specific tabs for shopping, stock, recipes and so on.
4. **Details:** a colorful **Product info** row with *barcode, pack size, brand and shop*; below it, the **Product details** table for category, minimum stock, optional storage hint and further domain fields; below that **Notes**. Use colored icons for headings and individual fields. No separate product-details strip above the tabs.
5. **Overview:** preview cards for each related model (recipes, shopping needs, purchases, alternatives, stock, shop, etc.). Each card has a real related record preview and a direct link to the owner workspace. There is no redundant navigation bar for the same linked models.
6. **Household stock simplicity:** “3 bottles” is one total quantity; do not split product inventory per physical location or invent average usage. A storage location may be informational, but users are not asked to micromanage where every bottle is.
7. **Imagery:** prominent and useful; photograph slots fill their area, while product packshots and technical images preserve important information instead of cropping labels off.

The saved visual reference predates some of the most recent changes; **the interactive HTML and this contract take precedence** on structure and action placement. The reference image is for color, spacing and friendly B2C design language.

## Included example workspaces

Twenty reachable example screens: product, product stock, shopping list, recipe, purchase list, purchase detail, linked product alternatives, shop, expense, expenses overview, recurring expense, money flow, bank account, income, task, project, floor-based home explorer, device, energy and dashboard.

The examples show cross-model routes and preserved financial responsibilities (recurrence, expected/paid, income, contributions, linked account entries), plus floor and energy concepts. The views and details use **fictional sample records** and do not constitute a complete replacement for the current application's full domain workflows. A full capability inventory against the current services, schemas, jobs and MCP remains mandatory before any production redesign.

## What the prototype does not do

- No live household data, network requests, authentication, database writes, receipts, stock updates, money transfers or Home Assistant commands.
- Action forms illustrate presentation and are explicitly non-persistent.
- Counts and amounts are illustrative. Unknown numbers should remain unknown in production.
- Does not replace production tests, actual accessibility audits or production-ready finance and integration behaviour.

## Validation in this iteration

The inline JavaScript parses with Node.js; browser-rendered desktop and mobile widths have no script errors or horizontal overflow in the sampled checks. A 20-workspace navigation and Details/Overview interaction sweep and dropdown modal test passed at 1440 px and 390 px. This is **prototype validation only**, not acceptance of the built application.
