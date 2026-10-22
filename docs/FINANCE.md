# Finance: expenses, income, money flow, projects

Status: design (2026-10-03), agreed with the owner before building. Supersedes the separate Bills and Subscriptions
pages. **Phase 1 (Expenses) and phase 2 (Income, joint accounts, money flow) are built**: see
[Phase 1 as built](#phase-1-as-built) and [Phase 2 as built](#phase-2-as-built) for the decisions made while
building them. **Phase 3 (Projects) is built**: see [Phase 3 as built](#phase-3-as-built).

## Principles

- **One kind of expense.** A bill is an expense that doesn't recur; a subscription, loan, down payment
  (afbetaling) or insurance is an expense that does. They behave the same: payment method, paid / not paid,
  who pays.
- **Who pays** is always one of three: **Joint account** (the default; replaces "not set"), **one person**, or
  **split between persons** (amounts or equal split).
- **Like the bank, but not 1:1.** Balances of the joint accounts follow from what the app knows. When they drift
  from reality, you set the real balance; the app records a *correction* in the history instead of inventing
  bills or incomes.
- **Everyday spending counts.** Groceries, eating out, fuel or a gift are one-off expenses too, logged in seconds
  as already paid ("Log an expense": amount, category, optional shop, who paid, payment method).
- **Variable income is entered, not guessed.** Meal vouchers (maaltijdcheques) come monthly but depend on the
  days worked: a *variable* recurring income asks for the actual amount each month instead of assuming one (later
  the assistant can fill it in).
- **Projects are open-ended.** A renovation of a room with tasks and materials, a holiday, a family trip, a
  Christmas budget: anything with a budget that things can be linked to.

## Pages

| Page | What it does |
|---|---|
| **Expenses** `/expenses` | Add an expense (one-off or recurring). Views: *Upcoming* (next to pay, filter: joint / per person), *Recurring* (everything running: subscriptions, loans, down payments, insurance… filter by kind, status active/paused/ended), *History* (paid). Mark paid, payment QR. |
| **Income** `/income` | Recurring household incomes per member (salary, holiday pay, end-of-year bonus…), adjustable with history ("from 1 Jan: € 2.450"); one-off incomes (tax return, green certificates, gift…), per person or joint. |
| **Money flow** `/money` | Per month: income in, contributions to the joint account (planned vs transferred), joint outgoings (paid / upcoming), transfers to and from savings, project budgets. Joint account and joint savings account: balance, history, corrections, "who transferred what". Next expenses per person and for the joint account. |
| **Projects** `/projects` | Projects with budget, optional room(s) and dates; linked tasks, materials, expenses. Budget vs committed vs spent, over/under by how much. |

`/bills` and `/subscriptions` redirect to `/expenses` (Upcoming and Recurring views).

## Data model (evolves the existing bills tables)

- **Recurring expense** = `BillSeries` (extended): `kind` SUBSCRIPTION | LOAN | DOWN_PAYMENT | INSURANCE |
  UTILITY | TAX | OTHER, `status` ACTIVE | PAUSED | ENDED, optional `endDate` (loans end), `websiteUrl`,
  `trialEndsOn`, `remindDaysBefore`, `candidateToCancel` (from subscriptions).
- **Expense** (one to pay) = `Bill`: one-off, or an instance of a series, with `paidOn`.
- Both carry: **payment method** DIRECT_DEBIT (domiciliëring) | WIRE_TRANSFER | CARD | CASH | MEAL_VOUCHER | OTHER;
  **category** including everyday spending (groceries, household, eating out, transport/fuel, leisure, gifts,
  clothing, personal care, pets) next to the fixed costs (energy, water, internet/phone, insurance, taxes,
  housing, healthcare, school/childcare, car, other); optional **shop** for purchases;
  **beneficiary** name, IBAN, optional BIC; **reference** free text or structured communication (OGM/VCS,
  mod-97 checked); **payer** `JOINT | PERSON | SPLIT` with `payerHabitantId` or shares; optional `projectId`.
  Direct debits are marked paid automatically on their due date (can be undone).
- **Payment accounts** (`PaymentAccount`): kinds `JOINT` (joint current account) and `SAVINGS` (joint savings
  account). Personal accounts are not modelled; "one person" is enough.
- **Account ledger** (`AccountEntry`, new): account, date, signed amount, type CONTRIBUTION (from a person) |
  TRANSFER (joint ↔ savings) | INCOME (joint income) | EXPENSE (link to a paid joint expense) | CORRECTION |
  OTHER, optional habitant ("who"), note. A CORRECTION stores the balance it set and the difference.
  Balance = latest correction + entries after it. Paid joint expenses count automatically.
- **Contribution plan** per person: fixed monthly amount to the joint account (and optionally to savings), day
  of month. The money flow shows planned vs actually recorded transfers; "Record transfer" is prefilled.
- **Income source** (recurring, new): person or joint, name, kind (salary, holiday pay, bonus, meal vouchers,
  benefit, other), RRULE, start/end, and an amount mode: **fixed** (amount with history of effective dates) or
  **variable** (optional estimate; each period shows "enter this month's amount" until the actual is entered, e.g.
  meal vouchers).
- **Meal vouchers** are not money in the bank: received vouchers (variable income per person) and groceries paid
  with them (payment method MEAL_VOUCHER) give a voucher balance per person, shown on the money flow page. **Income** (one-off, new): date, amount, person or
  joint, kind (tax return, green certificates, gift, sale, other), note.
- **Project** (new): name, icon/colour, free tag (renovation, holiday, trip, Christmas…), optional places,
  dates, budget, status planned | active | done, notes. Tasks, expenses and shopping items/materials can link to
  a project (`projectId`). Materials can carry an estimated price, so the budget sees committed costs.

## Migration of existing data

- The 14 subscriptions become recurring expenses (`kind` SUBSCRIPTION unless obviously otherwise; the owner can
  re-label loans and down payments): cycle → RRULE, next renewal → first due date, owner → payer PERSON (else
  JOINT), status, trial, reminder, notes and website kept. Upcoming instances are generated from the next
  renewal date onwards; no invented history.
- The 3 bills stay as they are; "not set" payer becomes JOINT.
- The old subscriptions table stays (read-only) until the owner has checked the result, then a later migration
  drops it.

## Phase 1 as built

**Code.** One feature, `expenses`: `prisma/schema/expenses.prisma`, `src/api/expenses` (`/api/expenses`),
`src/features/expenses`, stories in `stories/features/expenses`. The bills and subscriptions features are gone;
the `subscriptions` table and its Prisma model stay (read-only) until a later migration drops them.

**No-churn rename.** Models carry domain names, tables keep theirs: `Expense` → `bills`, `RecurringExpense` →
`bill_series`, `ExpenseShare` → `bill_shares`, `RecurringExpenseShare` → `bill_series_shares`,
`recurringExpenseId` → column `seriesId`, enum `ExpenseCategory` → type `BillCategory`. Documents still attach to
expenses with entity type `"bill"`, so existing attachments keep working.

**Fields.** Template and instance: `paymentMethod` (nullable = not set), `beneficiaryName` (falls back to the
payee), `iban`, `bic`, `structuredCommunication` *or* `reference` (never both), `payerType` (default JOINT),
`payerHabitantId`, shares (SPLIT only). Template only: `kind` (default OTHER), `status`, `endDate`, `websiteUrl`,
`trialEndsOn`, `remindDaysBefore`, `candidateToCancel`, `legacySubscriptionId` (migration idempotency and
`/subscriptions/:id` redirects). Instance only: `shopId` (everyday spending), `autoPaidAt`. Extra categories:
the everyday ones plus `subscriptions` and `loans`. `paymentAccountId` stays for phase 2; `projectId` comes in
phase 3.

**Recurring.** Instances are materialised 12 months ahead and copy the template (payment details, payer,
shares). Editing a template ("this and all upcoming ones") regenerates unpaid instances from min(today, start);
editing one instance leaves the template alone. **Pause** removes unpaid instances after today and stops
generation; **Resume** continues from tomorrow (skipped occurrences are not made up); **End** removes unpaid
instances after the end date (default today) and keeps the template in the Recurring view; **Delete** removes the
template and its unpaid future instances (paid ones stay as history).

**Payments.** One shared module (`types/payment-references.ts`) validates and formats OGM (`+++123/4567/89002+++`,
mod-97 with 97 for remainder 0, any notation accepted; text that looks like an OGM but fails the check is an
error, not free text), IBAN (ISO 13616 mod-97, country length, shown in groups of four) and BIC. The payment QR
is EPC069-12 version 002 (`types/payment-qr.ts`): BIC optional, name ≤ 70, `EUR12.34`, the OGM's 12 digits in
the structured creditor reference, free text in the remittance field. It shows for unpaid expenses not paid by
direct debit, card or cash, once there is a valid IBAN.

**Direct debits.** Job `expenses.auto-pay` (06:10, catch-up after a restart) marks unpaid DIRECT_DEBIT expenses
paid on their due date (`paidOn` = due date), looking back at most 7 days. Undo ("Not paid after all") clears
`paidOn` but keeps `autoPaidAt`, so the job doesn't pay it again.

**Who pays.** Upcoming and History filter on Everyone / Joint / a person (a person's own expenses and their share
of split ones); Upcoming shows "Next to pay" for the joint account and each person. Equal splits are cent-exact
(leftover cents to the first person).

**Everyday spending.** "Log an expense": amount (big, decimal keyboard), category (everyday first), date (today),
optional shop (shop picker with favourites/recent, logo in lists), payer, method (default card); saved as paid,
so it shows in History. The payee is the typed text, else the shop, else the category. It stays a bespoke
dialog on purpose (seconds-fast on phones: category and date side by side, live payee).

**Lists and forms.** Upcoming, Recurring and History are `GeneralList`s (same search, list/tiles remembered per
view; who-pays and kind/status filters in the toolbar; Upcoming/History grouped per month with the month's
total). The expense form (also the recurring template's edit) is a `GeneralFormDialog` whose payee, amount,
recurrence, total still open, payment details, payer split and project are custom fields.

**Calendar.** Source `expenses`: every expense as an all-day item on its due date ("Fluvius · € 123,45", kind
`bill`, status in `meta`; overdue red, paid grey) linking to its page, plus computed occurrences of active
recurring expenses beyond the generation horizon (linking to the recurring expense), for any range, without
doubles.

**For other features.** `listUnpaidManualPayments(householdId, from, to)` (everything but direct debits),
`markExpensePaid` / `markExpenseUnpaid`, and `onExpenseChanged(listener)` (`src/api/expenses/expense-events.ts`)
let the tasks feature keep "Pay …" tasks in sync. The detail route composes a linked task panel and passes an
"On hold" reason (`linkedTask`, `onHold`, `onHoldById` props). Linking mail bills to existing expenses
(integrations, docs/INTEGRATIONS.md) uses `listPaymentTargets` (expenses plus computed occurrences beyond the
horizon), `listRecurringOccurrences`, `ensureRecurringInstance` (creates one occurrence; beyond the horizon it
materialises up to that date, so `generatedUntil` stays one range), `patchExpenseDetails` (amount, due date, OGM,
IBAN, beneficiary of one expense; paid ones only with `allowPaidChanges`) and `patchRecurringPaymentDetails`
(template + upcoming unpaid instances that still had the old value, no regeneration); all emit `onExpenseChanged`.
The detail route passes `DocumentAttachments` a `fileNote` ("From mail on …").

**Migration.** `scripts/migrate-subscriptions-to-expenses.ts [--dry-run]` maps each subscription: cycle → RRULE
(quarterly = `FREQ=MONTHLY;INTERVAL=3`), DTSTART = next renewal on or after the migration day, kind from the name
only when unambiguous ("Afbetaling" → DOWN_PAYMENT, "Lening"/"krediet"/"hypotheek" → LOAN, "verzekering" →
INSURANCE, else SUBSCRIPTION), owner → PERSON else JOINT, CANCELLED → ENDED, payment method text → enum when clear
("domicili…" → DIRECT_DEBIT, "overschrijving" → WIRE_TRANSFER, card names → CARD), else OTHER with the text in
the notes. Split bills become SPLIT; other bills are JOINT by default.

## Phase 2 as built

**Code.** Two features. `income`: `prisma/schema/income.prisma` (`IncomeSource`, `IncomeAmount`, `Income`),
`src/api/income` (`/api/income`), `src/features/income`, page `/income`. `money`: `prisma/schema/money.prisma`
(`AccountEntry`, `ContributionPlan`; accounts are the existing `PaymentAccount` with kinds `JOINT` and the new
`SAVINGS`), `src/api/money` (`/api/money`), `src/features/money`, page `/money`. Stories in
`stories/features/{income,money}`. One-way dependencies: money → income → expenses (API: exported service
functions; browser: `index.ts`). The money route composes `NextToPay` (expenses), `VoucherBalances` (income) and
the projects card into the screen's `nextToPay` / `vouchers` / `projects` slots.

**Balance = latest correction + what happened after it.** Ledger lines of an account are stored entries
(`AccountEntry`: CONTRIBUTION, TRANSFER, INCOME for e.g. interest, OTHER, CORRECTION) plus two *computed* kinds
that are never copied into the ledger: **paid joint expenses** (payer JOINT, `paidOn` set, not paid with meal
vouchers) and **incomes with a target account** (not meal vouchers). Because they are computed on every read,
"Not paid after all" or editing an income changes the balance at once, nothing can be counted twice and no
listener on `onExpenseChanged` is needed. Lines are ordered by date and, on one day, by when they were recorded
(an expense: its last change, i.e. when it was marked paid). A correction sets the balance; what was recorded
before it on its day is absorbed, what comes after counts. Computed lines from before the first correction (the
opening balance) are left out. Future-dated entries show as "Planned" and only count from their date.

**Which account.** A paid joint expense is taken from its `paymentAccountId` when that is a joint account, else
from the *default* joint account (`isDefault`, else the oldest JOINT account; the first JOINT account created
becomes the default). Without a joint account it counts nowhere. Personal accounts are not modelled (`PERSONAL`
stays unused).

**Corrections.** Creating an account asks for its balance on a date: that becomes the first CORRECTION (the
opening balance, which can't be deleted). "Set real balance" adds a CORRECTION storing the balance it set
(`balanceCents`) and the difference at that moment (`amountCents`); the history recomputes the difference against
the lines before it, so it stays right when older lines change, and shows "Correction: +€ 123,45 (set to
€ 8.000,00)", highlighted. Later corrections can be deleted.

**Transfers and contributions.** "Record transfer" has *From* (a person, or another joint account) and *To* (a
joint account): from a person it is a CONTRIBUTION on the receiving account (`habitantId` = who); between accounts
two TRANSFER entries (−/+) with the same `transferId`, deleted together. A contribution plan is a fixed monthly
amount per person and account with a day of the month (clamped) and active from/to. The money flow shows per
person and account the planned amount (the plan in force that month) vs the contributions recorded that month,
with "Record" prefilled with what is still to go and the planned day. Saving a new amount from a later date ends
the old plan the day before and starts a new one, so earlier months keep their plan.

**Income.** A recurring income (`IncomeSource`) belongs to a person or is joint (`habitantId` null), has a kind
(salary, holiday pay, bonus, meal vouchers, benefit, other), an RRULE (weekly/monthly/yearly; the 31st clamps) with
start and optional end, an optional target account, and an amount mode. FIXED takes the amount from its history
(`IncomeAmount`: the latest entry effective on the occurrence date; editing the amount adds an entry from a chosen
date, default today, so earlier months keep theirs). VARIABLE has an optional estimate. Occurrences are computed,
never stored: each is *received* when an `Income` with the same source and `periodDate` exists, else *expected*
(fixed; "Received" records it, prefilled with the planned amount) or *to enter* (variable; "Enter amount" asks for
the actual amount). Who and kind of such an income always come from the source. One-off incomes (tax return, green
certificates, gift, sale…) are `Income` rows without a source. Month totals per person, joint and household =
recorded incomes (counted in the month of the occurrence they fulfil, else of their date) + expected occurrences
(fixed amount or estimate); meal vouchers are counted apart. Children can look, not edit.

**Received vs expected is relative to today.** A recorded income is *received* only when its date is today or
earlier (household day, Europe/Brussels; `isReceived` in `income-calculations.ts`, tests in
`src/api/income/income.test.ts`). One dated later (a tax return announced for 30/10, an amount entered early) is
still *expected*: it counts in `expectedCents`, an occurrence it fulfils has status `upcoming`, the planned list
shows it as "Expected 30/10/2026" (one-offs via `upcomingIncomes` / `IncomeOverview.upcoming`) and the history
marks it. The same rule everywhere: the money flow's income section, the dashboard money card, the timeline
(`incomeFlowItems`: projected, not received), meal voucher balances (a lot only from its date), the joint
account balance (an income with a target account counts from its date on; the account card shows it as
"Expected in", and the coverage card adds it to the projected end-of-month balance via `incoming`).

**Meal vouchers.** Not money in the bank: MEAL_VOUCHERS incomes never count in balances or money totals. See
[Meal vouchers: expiry and who pays](#meal-vouchers-expiry-and-who-pays) for the balance per person.

**Money flow page.** Month navigation (`?month=YYYY-MM`). Account cards (balance, latest correction, month in/out,
"Set real balance", "Record transfer", edit, other in/out), income in (per person received vs expected, amounts to
enter), contributions (planned vs recorded, plans), joint outgoings (joint expenses due or paid this month), the
history of one account (`GeneralList`, corrections marked, paid expenses link to the expense), next to pay, meal
vouchers and projects. Without accounts it opens with "Set up the joint accounts".

**For other features.** API: `getIncomeMonth`, `getVoucherBalances`, `listAccountIncomes` (income);
`listJointAccounts`, `getMoneyMonth`, `getMoneySummary` (money). Added to expenses: `listJointPayments`,
`listExpensesBetween`, `listUnpaidExpenses`, `listMealVoucherSpending`, `GET /api/expenses/unpaid`,
`mealVoucherPortions`, and the `NextToPay` / `fetchUnpaidExpenses` exports. Dashboard: a "Money this month" card
(`GET /api/money/summary`: income this month received + expected, expenses due this month, joint and savings
balances; a failing request only empties that card) and the quick action "Record income" (`/income?new=1`).

**No jobs.** Nothing has to be materialised: occurrences, the variable-income prompt, contribution status and
balances are computed on read.

**Known gaps.** Contributions only go to joint accounts (personal
accounts aren't modelled); no bank import, so drift is fixed with corrections; an expense that is edited (not
re-paid) on the day of a later correction moves after it.

## Meal vouchers: expiry and who pays

Belgian electronic meal vouchers expire **12 months after they are credited**. The balance is computed on read
(pure `voucherBalances` in `src/features/income/types/income-calculations.ts`, tests in
`src/api/income/income.test.ts`); nothing is stored.

- **Lots.** Every received MEAL_VOUCHERS income of a person is a lot, usable from its date up to and including
  the same date 12 months later (`voucherExpiry`; the 29th of February clamps to the 28th). Expired from the
  day after.
- **FIFO.** Paid expenses with method MEAL_VOUCHER (in date order, by `paidOn`) take from that person's oldest lot
  that is valid on the payment day, then the next. A payment no valid lot covers (spent before the vouchers
  arrived, or vouchers missing from the income page) is *uncovered*.
- **Per person**, on today: available (valid, unspent), the next expiry date with what is left on it, expired
  (unspent past its date), uncovered, and balance = available − uncovered (negative in red). Shown as
  "€ 61,69 available · € 30,00 expires on 04/09/2027" on the income page and the money flow (`VoucherBalances`).
- **Warning.** When vouchers expire within **30 days** (`VOUCHER_WARN_DAYS`) the card shows "Meal vouchers expire
  soon: Rob: € 30,00 expires on 20/10/2026." The job `income.voucher-tasks` (daily 06:45, catch-up) adds a linked
  task "Use € 30,00 meal vouchers before 20/10/2026" for that person (origin `vouchers:<habitantId>:<expiry
  date>`, due on the expiry date, opens `/income`), updates its amount as vouchers are used, marks it done once
  nothing is left on that date, and removes it once the date has passed. A task someone closed is left alone.
- **Who pays with vouchers.** Vouchers belong to a person, so an expense paid with MEAL_VOUCHER needs payer PERSON
  or SPLIT (each share comes from that person's vouchers). The contract (`checkPayment` in
  `src/features/expenses/types/expenses.ts`) refuses MEAL_VOUCHER with payer JOINT on create and edit ("Meal
  vouchers belong to a person: choose who paid with them"); in the forms, picking *Meal vouchers* hides "Joint
  account" and switches a joint payer to the logged-in person. The assistant's `expenses.log` always books
  voucher payments on the person asking. Existing rows are never re-validated: an older JOINT expense paid
  with vouchers counts for whoever marked it paid (`paidById`), else for nobody; editing it asks for a person.

## Phase 3 as built

**Code.** Feature `projects`: `prisma/schema/projects.prisma` (`Project` → `projects`, `ProjectPlace` →
`project_places`, enum `ProjectStatus`), `src/api/projects` (`/api/projects`), `src/features/projects`, stories in
`stories/features/projects`. Details, pages and the budget rules: [PROJECTS.md](PROJECTS.md).

**Links.** Nullable `projectId` (relation, `onDelete: SetNull`) on `tasks`, `bills`, `bill_series` (instances copy
it when generated; changing it on a template moves all its instances) and `shopping_items`. Materials reuse
`shopping_items.priceCents` as the known or estimated price per unit (product shop-link prices are the fallback),
so there is no separate estimate column. `shopping_items.expenseId` (soft reference) records "this purchase was
logged as that expense" (or "on that invoice": Link materials, optionally read by the AI; see PROJECTS.md), which
keeps the budget from counting it twice, as long as that expense counts for the project. A material of a task in
a project counts for the project.

**Budget.** Spent = paid linked expenses + bought priced materials not logged as an expense; committed = unpaid
linked expenses (recurring instances only up to the project's end date) + open priced materials; remaining =
budget − spent − committed; at risk above 90 %, over budget above 100 % ("€ 1.587 over budget"). Nothing stored.

**Other features stay unaware.** Tasks, expenses and shopping know only `projectId` and a `ProjectRef`
(`@/types/projects`) for chips; their forms take a `projectField` slot that the routes fill with the projects
feature's `ProjectFormField`. A form without the field keeps the project (a missing `projectId` means "keep",
`null` removes it). The project page composes `ProjectTasksPanel` (tasks), `ProjectMaterialsPanel` (shopping),
`LogExpenseDialog` (expenses, posting to `/expenses`) and `DocumentAttachments` (entity type `project`).

**Money flow.** `src/routes/money.tsx` loads `fetchProjectBudgetsSummary(month)` un-awaited and renders
`ProjectBudgetsCard` in the money screen's `projects` slot: running projects of the month (and any project with
money paid or due in it), with budget status, paid this month and due this month.

**Calendar.** Source `projects` (chip "Projects"): all-day bars from start to end date; cancelled projects left out.

## Loans: total open amount

A loan rarely ends on payment × number of payments, so a recurring expense can carry the **total still open**
(`bill_series.totalOpenCents`) and the due date it counts from (`totalOpenAsOf`; empty = the next unpaid due
date, for a new one the first due date). The maths is pure and shared by API and form
(`src/features/expenses/types/total-open.ts`, tests in `src/api/expenses/total-open.test.ts`).

- **Plan.** N = ceil(open / amount) payments on the rule's dates from the as-of date; the last one is
  open − amount × (N − 1) (more than 0, at most one payment). Less than one payment: one payment of the total.
  Divides evenly: no partial payment. At most 999 payments.
- **Settled instances.** Instances that exist from the as-of date on and keep their amount (paid ones, older
  unpaid ones that are not regenerated, and during top-ups every generated one) count with their own amount
  and their dates are skipped; the plan covers the rest. Payments due before the as-of date don't count.
- **End.** The rule's end is stored as `UNTIL` = the last payment's date (COUNT is dropped), so the next due
  date, the calendar and other features stop there too. Generation always follows the fresh plan and keeps
  that UNTIL in step.
- **Instances.** Generated instances get the regular amount, the last one the partial amount (split shares
  scaled cent-exact, leftover cents to the first). The last one may lie beyond the 12-month horizon: the top-up
  that reaches it gives it the partial amount, and the calendar's virtual occurrences show it and stop after it.
- **Recompute.** Editing the template ("this and upcoming") with a changed amount, total, rhythm or as-of date
  replaces the unpaid instances from min(today, start) as before and plans them again; paid ones are never
  rewritten. Editing one instance doesn't replan right away; later top-ups take its amount into account.
  Paused templates keep their plan (shown as payments to go); ended ones plan nothing more.
- **Progress.** Remaining = total − paid instances due on or after the as-of date; payments to go = unpaid
  instances from then plus the planned ones beyond the horizon; last payment date and amount. Shown on the
  recurring expense page and in its Recurring row: "€ 4.027,81 of € 10.000,00 left · 5 payments to go · last
  on 5 Feb 2027", with a bar.
- **Form.** Kind sits next to the rhythm. For loans and down payments "Total still open" with "As of" shows
  prominently, for other kinds under "Paying something off?". When filled, the repeat end is shown read-only
  ("After 12 payments, on …", via `RecurrenceFields lockedEnd`) with "12 payments: 11 × € 853,17 + last
  € 615,13"; clearing it gives the end settings back (the posted rule then applies as is).

## Money flow: loans and income/expenses timeline

Two cards on `/money`, loaded un-awaited by the route (skeleton while loading; a failure only empties that
card). One-way: money → income/expenses through exported service functions.

- **Loans and down payments** (`GET /api/money/loans`, `getMoneyLoans` ← expenses' `getLoanSummaries`):
  running (active or paused) loans and down payments plus anything else with a total open amount. Totals:
  still open and total over the loans with a total open amount, repaid since their as-of dates, and the
  monthly cost of the active loans and down payments now (also those without a total). Per loan: name (links
  to the recurring expense), what is left with the same progress bar as the expenses pages, or "/mo" with a
  hint to add the total.
- **Income and expenses per month** (`GET /api/money/timeline?from=YYYY-MM&to=YYYY-MM`, default 12 months back
  to 24 ahead, at most 60; pure `buildMoneyTimeline` in `src/features/money/types/money-timeline.ts`, tests in
  `src/api/money/money-timeline.test.ts`). Nothing is stored.
  - *Income* (`listIncomeFlow` / `incomeFlowItems`): received incomes on the date of the occurrence they fulfil;
    from the current month on the occurrences not recorded yet: fixed sources with their amount history,
    variable ones at their estimate (marked "estimate"; none: left out). Earlier missed occurrences don't
    count. Meal vouchers are left out.
  - *Expenses* (`listExpenseFlow`): paid expenses on their payment date; unpaid ones on their due date (overdue
    ones count in the current month); and the computed occurrences of active recurring expenses beyond the
    generation horizon, with a loan's partial last payment and its end (`projectedOccurrences`; paused and
    ended templates add nothing). Split into loans and down payments, other recurring and one-off. Meal
    vouchers are left out.
  - *Chart*: the shared `StackedBarChart`, extended (all optional) with a signed line (net), a projected part
    (lighter, dashed outline, shaded, "projected" in tooltip and table), a "now" marker, extra tooltip content
    and sideways scrolling when columns get narrower than `minColumnWidth` (phones start at "now"). Income
    above the baseline (estimate lighter), expenses below, net as a line; 6, 12 or 24 months ahead; a summary
    line ("Projected expenses drop from … to … a month in February 2027") and the table view for screen
    readers.

## Contributions: settling the month

On `/money` the contributions card says per person who actually transferred how much, what the end result
should be and what still has to happen; the coverage card next to it says whether the plans cover the joint
costs. All computed on read (pure `src/features/money/types/contribution-settlement.ts`, tests in
`src/api/money/contribution-settlement.test.ts`, runtime check `scripts/money-settlement-runtime-check.ts`);
the only new stored thing is "Keep as extra".

- **Per person and account** (`personSettlement`): *planned* = the plan in force that month; *transferred* =
  the net of their CONTRIBUTION entries dated in the month (listed with dates on expand); *result* =
  transferred − planned: "€ 800,00 too much" (warning), "still € 1.450,00 to transfer" (soon once the planned
  day has passed, else info) or "Done" (success).
- **What still needs to happen** (`settleAccount`): "Rob → Fortis gezamelijk: € 1.450,00" for whoever is
  short, "Clara: take back € 800,00 (or keep it as extra)" for whoever is over. When someone is over and
  someone else short, the **netting** alternative (`netContributions`, largest amounts first): "Or: Rob pays
  Clara € 800,00 directly and transfers € 650,00 to Fortis gezamelijk. Same end result." Then the end result:
  "Then: Clara € 1.200,00 · Rob € 1.450,00 · total € 2.650,00 on Fortis gezamelijk" (plan + extra kept).
- **Record** opens "Record transfer" prefilled with what is still to transfer and the planned day.
- **Take back** (`POST /api/money/contributions/take-back`) is a **negative CONTRIBUTION** of that person, not
  a new entry type: it lowers the balance like a withdrawal and their net for the month, and the history shows
  "Taken back by Clara". Deleting the line undoes it.
- **Keep as extra** (`PUT /api/money/contributions/extra`, table `contribution_extras`: person, account, month,
  amount) accepts up to that amount of the month's surplus: no longer flagged ("Done · € 800,00 extra kept"),
  still in the balance (the entries are). "Undo" (amount 0) deletes the row. A later, larger surplus is flagged
  for the part above it.
- **Direct payment** (`POST /api/money/contributions/direct`, the netting alternative's "Record direct
  payment"): two CONTRIBUTION entries with one `transferId`, + for who paid, − for who received ("Rob paid
  Clara directly" / "Clara: settled with Rob directly"). The balance doesn't change; deleting one deletes both.
- **Dates and corrections.** A contribution counts in the month of its date. One dated before the account's
  latest correction (in ledger order) still counts for that month's plan but doesn't change the balance (the
  real balance already includes it); it is marked in the expanded list. "Record transfer" says so when the date
  is before the last correction, and warns that on the correction's own day it is added on top of it.
  Settling a past month dates take-backs and direct payments on its last day.
- **Coverage** (`contributionCoverage`): the month's planned contributions to the joint current accounts (not
  savings) vs the month's **joint costs** (`jointCostsOfMonth` over `listExpenseFlow(…, { payer: "joint" })`:
  paid in the month + unpaid due in the month, computed occurrences of recurring expenses and loans beyond the
  generation horizon included, meal vouchers left out; unpaid ones from earlier months are not counted). Shows
  "Contributions cover the joint costs", "… € X left over" or "Short by € 1.323,88 this month".
- **Projection** (current month only): today's balance of the joint current accounts + what people are still
  short − the joint costs still to pay; walking those by date (payments before receipts on the same day,
  overdue planned days count from today) gives the lowest point and "The joint account goes below zero on
  15 Oct (lowest −€ 1.033,62)".
- **Suggestions** when short: new amounts that cover the costs, split like the current plans and, when every
  planner has income that month, like their incomes; each part rounded up to whole euros. "Update plans"
  (`POST /api/money/plans/amounts`, current and future months) saves them from the month's first day; plans
  that started earlier end the day before, so earlier months keep theirs.

**Layout.** Accounts in one row (`PageGrid`, two or three columns from `md`; a missing joint or savings account
is a dashed "Add savings account" card in that row); then contributions (wide) next to coverage
(`main-sidebar`), income and joint outgoings (two columns), timeline and loans, history, next to pay /
vouchers / projects. Card headers (`MoneyCardHeader`) put the description under the title and wrap the actions
below when there is no room; card buttons wrap their label and go full width on phones; person and account
names wrap instead of being truncated. One column below `sm`.

## The assistant

Four skills (`ai/skills/{expenses,income,money,projects}`, see [ai/README.md](../ai/README.md)) expose the
finance pages to the assistant through the same service functions: due bills (per person or joint), payment
details exactly as recorded (IBAN, OGM; "not recorded" otherwise), add / edit / pause / end / delete expenses,
mark paid or not, put a pay task on hold; incomes received vs expected (the `isReceived` rule), one-offs,
recurring incomes and raises; balances, contributions and their settlement, coverage and projection, transfers,
corrections, plans, loans and the timeline; projects with their budget status, costs and links. Every money
change is confirmed on a card showing amount, payer, date and account. Reads follow the pages (children may
look at expenses and projects); income and the money flow stay with owners and adults in the assistant.
Not exposed: account setup and editing (colours, owners, archive), recurring-expense trial / website /
reminder fields, deleting a recurring income source (end it instead), editing a recorded income (delete and
record again), project cover images, the payment QR.

## Build order

1. Expenses (merge, payment methods, references, payer, QR, calendar source, migration).
2. Income, joint accounts with ledger and corrections, money flow page.
3. Projects and their budgets in the money flow.
