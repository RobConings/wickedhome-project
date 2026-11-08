# Related-record summary cards

**Scope:** these cards are only the navigation **entry point**. They do not satisfy the requirement for every first-class user-facing business model to have a real dedicated workspace with owner-filtered related sections, contextual actions and round-trip navigation. Apply the [wireframe review and model-workspace contract](wireframe-review-and-model-workspaces.md) alongside this component contract.

The related summaries remain useful navigation: Tasks 3, Materials 3, Purchases 2, Costs €460 and Documents 2. Present them as small cards with a coloured icon, readable label and summary value. The entire card opens the related records.

## Layout and interaction

| Context | Behaviour |
|---|---|
| Phone | Two equal columns, wrapping labels/values and comfortable full-card targets |
| Desktop | Cards share the available row width and wrap when necessary |
| Current section | Accent border/fill, stronger label and `aria-current="location"` |
| Keyboard | One ordinary focusable link per card and a visible focus ring |
| No numeric summary | Show the label/icon without inventing a zero |
| Missing or restricted records | Apply the owner's access/read rules to both summary and destination |

Use domain icons: a checklist for Tasks, package for Materials, receipt for Purchases, wallet for Costs and folder for Documents. The icon supports the text. Counts and amounts remain visible, with their existing meaning.

The cards sit below the record identity/context and above search/list controls. They navigate existing records and subviews. Primary actions such as Add a task remain distinct. Related summaries do not become editable totals or separate business workflows.

## Reuse and ownership

Production now provides `src/components/shared/related-record-cards.tsx`, composing `Card`, `IconChip` and Router `Link`. Project, task, room, recipe, device, expense, product and purchase contexts reuse it. Existing section anchors and owner record routes are the production destinations; illustrative atlas tabs do not require duplicate production pages. `StatTile` remains appropriate for larger figures and breakdowns.

Production contributors provide typed label, optional value/unit, route, icon/accent and identity. The host marks the current subview. The preview alone adapts the catalogue's authored label/summary strings. Shared UI must not parse translated business copy or compute counters.

The existing routes, filters, originating-record context and owner permissions are preserved. Selecting the current card keeps its current URL/context. Web and MCP still refer to the same record IDs and authorised summaries; this presentation introduces no new mutation or tool.

## Review

- [Phone example](preview/wireframes/related-cards-mobile.png)
- [Desktop example](preview/wireframes/related-cards-desktop.png)
- [Open the phone preview](http://127.0.0.1:55450/?screen=project-tasks&size=mobile&lang=en)

The phone composition uses a 76 px minimum card height with separated targets. Labels and summary values can wrap without widening the page. Example figures are fictional fixture data.
