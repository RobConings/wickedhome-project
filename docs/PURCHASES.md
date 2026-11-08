# Purchases and purpose allocation

Purchases presents existing acquisitions. It does not create a second ledger or replace stock, shopping, expense or project IDs.

## Entry points and owners

- **Purchases** in Finance lists recent visit purchases and standalone acquisitions, with search and remembered list/card views. Product and project links filter this same view.
- A purchase opens its original goods, receipts, expenses and shopping session. A standalone acquisition keeps its `StockPurchase.id`; a visit purchase keeps its `ShoppingPurchase.id`. Kind and ID travel together.
- Shopping owns starting, adjusting, buying, skipping, extras, closing, receipt matching and payment linking. Inventory owns stock movements and actual usage. Expenses owns payment status, payers and cost shares.
- Catalogue is a public facade over the existing product identity. A product's needs, tasks, projects, stock and purchase history reuse existing relationships.

## Goods, stock and money are separate facts

`StockPurchase.purchasedProductId`, `purchasedProductName`, `purchasedQuantity` and `purchasedUnit` snapshot what was selected when acquired. `productId`, `quantity` and `unit` continue to describe canonical stock credit. A pack can contribute a different known stock quantity. Missing historical package conversions stay unknown; older rows retain their original stock quantity/unit as the available evidence.

Changing a checklist variant does not rewrite an earlier acquisition. A deleted variant retains its snapshot name; the product link falls back to an available canonical product. A later receipt links existing acquisitions before recording missing goods.

An acquisition's **Assign purpose** dialog divides acquired quantities between projects and the household. Unassigned remainder stays visible. It neither reserves nor consumes stock, fulfils another requirement, assigns a cost nor creates a payment. Intended need/task/project links remain separate evidence. A project purchase view includes both those relationships and deliberate goods allocations.

An expense's **Cost allocation** panel divides integer euro cents between projects and the household. This changes the project share, not the gross expense or the bank effect. A €45 expense can allocate €35 to a project and €10 to the household while the account still records one €45 payment. Quantity shares never determine money shares automatically.

## Invariants

- Goods allocation locks the existing acquisition, checks its integer revision, and compares quantities at three-decimal precision. Total shares cannot exceed the acquired quantity. Projects must belong to the acquisition's household.
- An identical allocation retry returns the saved result without creating another share or revision. A changed stale draft conflicts and remains open for review.
- Expense allocation locks the existing expense and uses its current `updatedAt` revision. Project budgets use their assigned shares; account activity uses the original expense once.
- Deleting a project preserves its saved name and share in acquisition/expense history. Removing its cost share requires reviewing linked invoice materials first.
- Unknown amounts are labelled unknown. Children receive no purchase financial amounts or expense references; only adults/owners allocate goods or costs.
- Source documents retain Documents ownership and permissions. A filename or current screen is not authorisation.

## API and MCP

| Action | API | MCP |
|---|---|---|
| Recent purchases | `GET /api/purchases?productId=&projectId=` | `purchases_list` |
| Visit purchase | `GET /api/purchases/:id` | `purchases_details` kind `visit` |
| Standalone acquisition | `GET /api/purchases/acquisitions/:id` | `purchases_details` kind `acquisition` |
| Goods purpose | `GET/PUT /api/purchases/goods/:id/allocation` | `purchases_goods_allocation`, `purchases_allocate_goods` |
| Expense purpose | `GET/PUT /api/expenses/:id/allocations` | `expenses_project_allocation`, `expenses_allocate_projects` |
| Product relationships | `GET /api/catalogue/products/:id/context` | `inventory_product_context` |

Read current revisions before writes and keep the same payload on retry. Financial writes require explicit confirmation through MCP. The same owner services validate web and MCP calls. The list currently returns up to 200 recent visit purchases and 200 standalone acquisitions; existing older visit history remains reachable through Shopping.

## Local migrations

The additive migrations preserve existing records:

1. `20261107190000_shopping_variant_history`: acquired variant/name snapshots.
2. `20261107210000_connected_records`: device covers and expense cost shares.
3. `20261107220000_purchase_quantity_snapshots`: selected quantity/unit snapshots.
4. `20261108010000_purchase_purpose_allocations`: acquired-goods purpose shares and revision.

They have been applied to the disposable local test database. Deployment to the household server is a separate release operation.
