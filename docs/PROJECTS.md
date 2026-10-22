# Projects

Open-ended budget pots (Finance phase 3, see [FINANCE.md](FINANCE.md)): a room to renovate with tasks and
materials, a holiday, a family trip, the Christmas presents. Anything with a budget that tasks, expenses and
materials can be linked to. "Are we in or out of budget, and by how much?"

| Part | Browser | API | Data |
|---|---|---|---|
| Projects, detail, budget | `features/projects` | `src/api/projects/projects.service.ts`, `projects.routes.ts` (`/api/projects`) | `projects`, `project_places` |
| Linked tasks | `ProjectTasksPanel` (tasks) | `GET /api/tasks?projectId=` | `tasks.projectId` |
| Materials | `ProjectMaterialsPanel` (shopping) | `GET /api/shopping/items?projectId=` | `shopping_items.projectId`, `.priceCents`, `.expenseId` |
| Expenses | `ProjectExpensesSection`, `LogExpenseDialog` (expenses) | `/api/expenses` with `projectId` | `bills.projectId`, `bill_series.projectId` |
| Money flow | `ProjectBudgetsCard` / `ProjectBudgetsSummary` | `GET /api/projects/summary?month=` | computed |
| Calendar | source `projects` | `projects.calendar.ts` | computed |

## A project

Name, icon and colour, a free **kind** (tag) with suggestions (renovation, holiday, trip, Christmas, party, car,
garden, gifts, plus the household's own tags), optional description, places (any number of rooms or zones),
start and end date, an optional **budget** (empty: only track what it costs), status **planned / active / done /
cancelled**, and an optional cover (an image attached to the project in the documents feature). Deleting a project
keeps everything that was linked to it, without the link (`onDelete: SetNull`).

## The budget

Computed on read, never stored (`features/projects/types/project-budget.ts`, tested in
`src/api/projects/projects.test.ts`):

- **Spent** = paid linked expenses + bought materials with a price that were not logged as an expense.
- **Committed** = unpaid linked expenses + open materials (still to buy) with a known or estimated price.
- **Remaining** = budget − spent − committed (negative = over budget by that much).
- **Status**: over budget when spent + committed exceeds the budget; **at risk** above 90 % of it; else in budget.
  No budget: no status, the total is shown.
- **No double counting**: a purchase that was logged as an expense counts once, as the expense. "Log as expense"
  on the project page (for bought materials not logged yet) opens "Log an expense" with their total and then sets
  `shopping_items.expenseId`, so the items drop out of the sum and the expense counts. "Link materials" does the
  same for an invoice that is already an expense (below). A material only counts as "on an invoice" while that
  expense counts for the project (`budgetMaterialsOf`): when the expense is unlinked (its materials lose the link)
  or deleted, the materials count as bought items again, so no money disappears and none counts twice. Tested in
  `src/api/projects/project-invoices.test.ts`.
- **Material price** = the item's own price (from its webshop link or typed in, per unit) × quantity, else the price
  of its product at the item's shop, else the product's lowest known price. Materials without any price are left
  out and counted as "unpriced" (the budget card says so).
- **Materials of a task** in the project count for the project too (an item's own `projectId` wins).
- **Recurring expenses**: linking one links the template and all its instances; new instances copy `projectId`
  from the template. Unpaid instances count as committed, but only up to the project's end date (a subscription
  that runs on doesn't eat the budget of a finished project).

## Pages

- `/projects`: `GeneralList`, tiles by default (cover or colour strip, icon, name, kind, dates, budget bar with
  spent solid and committed striped, status badge, task progress), list rows, search, and a status filter
  (Running = planned + active, Done, Cancelled, All; `?status=`).
- `/projects/:id`: header with status, budget badge, kind and dates; Start / Mark done, Edit (`GeneralFormDialog`),
  more status actions and Delete. Budget card (spent / committed / remaining with their parts). **Tasks**: the
  project's tasks as a chain (tasks that wait for others come after them, indented: "Buy materials" →
  "Remove the old tiles" → "Start tiling"), done ones folded away, "Add a task" (a job in the project's first place)
  and "Add an existing task". **Materials**: add from the catalogue, by name or by pasting a webshop link (they go
  on the materials list, like a task's), tick off, set a price per unit (an estimate is fine); "Log as expense" for
  bought ones. **Expenses**: unpaid soonest first, then paid; recurring expenses; "Log an expense" (prefilled with
  the project), "Add an existing expense", "Add a recurring expense"; remove from the project. Details (places,
  dates, description), cover photo choice and attachments.

## Materials on an invoice ("Link materials")

Each expense row has **Link materials** (`LinkInvoiceMaterialsDialog`, a `GeneralFormDialog` posting `materials`):
the project's materials that aren't on another invoice, with a checkbox and what each cost on the invoice, and the
linked total against the expense amount (the difference, or "Matches the expense"). Saving sets the invoice's
materials as a whole: open ones become **bought** (on the expense's paid date, else today, by the person), changed
amounts become the material's price per unit (amount ÷ quantity), and materials unticked lose the link (they stay
bought). The expense joins the project if it wasn't linked. Right after **Add an existing expense** or **Log an
expense** on the project page the dialog opens by itself when there are materials not on an invoice yet. Linked
materials show an "On invoice Spa Center · 09/10/2026" chip on the materials list, with a button to take one off.

**Read invoice with AI** (only when the assistant is configured: `ProjectDetail.invoiceReader`) reads the expense's
invoice: the PDF of the mail it came from first, else another attached PDF (newest first), else a photo (JPEG, PNG,
WebP; only when the model reads images, `ASSISTANT_VISION`). The PDF's text (first 4 pages, `pdf-text.ts`) or the
photo goes with the list of materials (as `m1…`, name, quantity, expected price) to the household's model
(`ai/skills/projects/invoice-reader.ts`, registered into `src/api/projects/invoice-readers.ts` like the bill
reader; chat priority in the model queue, 90 s limit). It answers the invoice lines (description, quantity, total
incl. VAT) and the matches; the API keeps only materials it sent and lines that exist, one material per line and
one line per material (most confident first) and works out the unit price. The dialog ticks matches from 50 %
confidence (below 75 % they say "Check"), fills in the invoice prices ("Use invoice prices" switches back to the
list's prices), and lists invoice lines that aren't materials; ticking those (or "Add all") adds them as bought
materials on the invoice when saving. Nothing changes before Save. No invoice, a scan without text, the assistant
not set up, a model error or a timeout each give their own message; linking by hand always works.

Limits: a scanned PDF without a text layer can't be read (attach a photo instead); a long invoice is cut at ~9000
characters and 60 lines; the model may still misread a line, which is why the person checks every match. The same
reading is the assistant's `projects_link_invoice` (a list on the confirmation card; only matches from 50 %).

Waiting for a DIY-store run works with the existing task links: make "Buy materials" an errand with the materials
on it and let "Start tiling" wait for it (task page → Links → Waits for).

## In other features

Tasks, expenses and shopping never import projects (one-way dependency). They know a nullable `projectId` and
embed a `ProjectRef` (`@/types/projects`) for a chip:

- **Forms**: `TaskFormDialog`, `ExpenseFormDialog` and `LogExpenseDialog` take an optional `projectField` slot. The
  routes (`tasks`, `task-detail`, `expenses`, `expense-detail`, `recurring-expense-detail`) fill it with
  `ProjectFormField` (an `EntityPicker` with favourites and recently used, entity type `project`). The field posts
  `projectId`; an empty value removes the project. A form without the field leaves the project alone (the API
  treats a missing `projectId` as "keep").
- **Chips**: task rows and the task page, expense rows and pages, recurring expense rows and pages, and shopping
  items show the project (`TagChip` from `components/shared`), linking to it.
- **Panels**: `ProjectTasksPanel` (tasks) and `ProjectMaterialsPanel` (shopping) load their own data; the project
  route composes them with `DocumentAttachments` (entity type `project`) and `LogExpenseDialog` (posting to the
  `/expenses` action).

## API

`GET /api/projects` (all, with budgets and task counts), `GET /api/projects/:id` (project, expenses, recurring,
materials), `GET /api/projects/summary?month=YYYY-MM`, `GET /api/projects/candidates` (unlinked open tasks,
one-off expenses of the last year, recurring expenses), `POST /api/projects`, `PUT /api/projects/:id`,
`POST /api/projects/:id/status`, `PUT /api/projects/:id/cover`, `POST /api/projects/:id/links { kind, id }`,
`DELETE /api/projects/:id/links/:kind/:itemId`, `POST /api/projects/:id/purchases { expenseId, itemIds }`,
`PUT /api/projects/:id/expenses/:expenseId/materials { itemIds, prices?: { itemId, priceCents }[], newItems?: { name,
quantity, priceCents }[], markBought }` (the invoice's materials as a whole), `DELETE
/api/projects/:id/expenses/:expenseId/materials/:itemId` (one off its invoice, stays bought), `POST
/api/projects/:id/expenses/:expenseId/read-invoice` (the proposal: `{ source, lines, matches, unmatchedLines }`;
errors `no_invoice` 404, `invoice_unreadable` 422, `reader_unavailable` 503, `reader_failed` 502),
`DELETE /api/projects/:id`. Mutations need owner or adult; children see everything.

## Money flow and calendar

The money flow page shows `ProjectBudgetsCard`: running projects of the month (and any project with money paid or
due that month) with their budget bar and status, what was paid for them that month and what is due; the data is
loaded un-awaited in `src/routes/money.tsx`, so a failure only empties that card. Projects with a start date are the
`projects` calendar source: an all-day bar from start to end (or on the start date), cancelled ones left out.
