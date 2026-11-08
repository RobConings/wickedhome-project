# WickedHome documentation

English is the source language for project documentation, plan filenames and plan directories, and interface copy. The application supports Dutch through feature translations and bilingual search aliases. Keep technical identifiers, source-format values, user-authored record names and explicit translation examples unchanged.

## See the proposed experience

**Newest reviewable HTML prototype:** [20 connected mobile-first household wireframes](plans/application-redesign/preview/household-wireframes.html), with [usage notes](plans/application-redesign/preview/household-wireframes-README.md) and a [saved product workspace design reference](plans/application-redesign/preview/product-workspace-reference.svg). These are fictional design examples, not deployed screens.

Start with the [annotated wireframe walkthrough](plans/application-redesign/preview/walkthrough.html): sixteen screens across shopping, projects/money, the connected home and photos/view modes. It explains what changes and what happens next, using screenshots of the actual shared React compositions.

For interactive examples, start the [design atlas](plans/application-redesign/README.md). It contains 178 page/dialog variants, English/Dutch switching, desktop/mobile layouts and state examples. The [complete redesign plan](plans/application-redesign/plan.mdx), [ownership contracts](plans/application-redesign/architecture-contracts.md) and [AI/MCP contract](plans/application-redesign/ai-mcp-contract.md) define the target behaviour. The [feature preservation contract](plans/application-redesign/feature-preservation.md) requires all existing outcomes to remain accessible and correct even where simpler new interactions replace old screens or wireframes omit functionality. See [implementation status](plans/application-redesign/implementation.md) for the local implementation, validation and release limits; these documents do not establish deployment.

## Implementation and development

| Document | Purpose |
|---|---|
| [Architecture](ARCHITECTURE.md) | Current stack, layers, imports, ownership and local/server separation |
| [Adding a feature](ADDING-A-FEATURE.md) | Component reuse, forms/lists, selection, translations, routes, API and assistant integration |
| [Branding](BRANDING.md) | Current visual tokens, semantic colours and proposed playful direction |
| [Product vision and roadmap](ROADMAP.md) | Product scope, historical foundation and next redesign sequence |
| [CI/CD](CI-CD.md) | Repository checks, opt-in deployment and release handling |
| [Accounts](ACCOUNTS.md) | Invitations, roles, account management and sessions |
| [Audit](AUDIT.md) | Activity history, actors, channels and retention |
| [Automations](AUTOMATIONS.md) | Scheduled jobs, locking, execution and management |

Development uses the local checkout at `/Users/robconings/WickedHome` with machine-local dependencies and a development/test database. The canonical remote is `https://github.com/RobConings/wickedhome-project.git`. A mounted server directory is not an SSH session. Deployment uses the server's environment and is separate from editing docs or wireframes.

## Domain guides

| Area | Documentation |
|---|---|
| Purchases, purpose shares and cost allocation | [Purchases](PURCHASES.md) |
| Shopping, trips, receipts and payments | [Shopping implementation report](SHOPPING-SESSIONS.md) |
| Products, stock, scanning and alternatives | [Inventory](INVENTORY.md) |
| Tasks, dependencies, materials and reminders | [Tasks](TASKS.md) |
| Recipes, shopping needs and actual cooking use | [Recipes](RECIPES.md) |
| Expenses, income, accounts and contributions | [Finance](FINANCE.md) |
| Project goals, materials, budget and invoice links | [Projects](PROJECTS.md) |
| Devices, live values and profiles | [Devices](DEVICES.md) |
| Spaces and plan editing | [Floor plan editor](FLOORPLAN-EDITOR.md) |
| Measurements, sources and energy setup | [Energy](ENERGY.md) |
| Home Assistant, Google, Drive, email and assistant connections | [Integrations](INTEGRATIONS.md) |
| Personal notifications and delivery | [Notifications](NOTIFICATIONS.md) |
| Address, collection schedule and weather sources | [Waste and weather](WASTE-WEATHER.md) |

## AI and MCP

Start at [the AI overview](../ai/README.md). [Assistant setup and operation](../ai/docs/ASSISTANT.md), [adding tools](../ai/docs/ADDING-TOOLS.md), [MCP OAuth](../ai/docs/MCP-OAUTH.md) and [web search](../ai/docs/WEB-SEARCH.md) describe current contracts. Compact runtime guides live in `ai/skills/*/guide.md`; published tools and their schemas determine actual capabilities.

The [redesign AI/MCP contract](plans/application-redesign/ai-mcp-contract.md) adds requirements for future journey/context changes. It does not create tools or change permissions by itself.

## Historical implementation plans

[Purchase/counting implementation](plans/purchases-and-inventory.mdx) and [shared shopping implementation](plans/shopping-sessions.mdx) are now in English. Their filenames and internal links use English. Completed phases and recorded test counts describe those deliveries, not fresh tests or the current server revision.

## Documentation review

The [review notes](DOCUMENTATION-REVIEW.md) describe the language scope, corrected inconsistencies and remaining distinctions between current behaviour and the design proposal.
