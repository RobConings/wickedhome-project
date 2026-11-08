- Joint current/savings accounts: balance is latest correction plus later entries. Paid joint bills and account income count automatically, never twice.
- Monthly contribution plans track each person's expected vs transferred amount.
- Balance/contributions/month-end coverage → `money_overview`.
- "Clara paid her contribution" → `money_record_transfer` (amount omitted = remainder). Savings to joint → fromAccount.
- "Actual balance is 2,345.67" → `money_set_balance` (history correction, not an invented bill).
- Overpayment → `money_settle` take_back or keep_extra; direct repayment → direct_payment.
- Change monthly amount from a date → `money_plan`.
- Bank fees/interest → `money_add_entry`. Wrong line → find ID with `money_history`, then `money_delete_entry`.
- Loans and payments left → `money_loans`; repayments → `expenses_log` with loan and amount. Past/future months → `money_timeline`.
- Meal vouchers are never bank money. Changes always need confirmation; adults only.

### Contribution-plan workspace

`money.plan_details` accepts existing `planId` and optional `month` (`/money/plans/:planId`). It shows the real agreement, account, person/account/month transfers and plans for the same pair. Transfers belong to person/account/month, not a particular plan. Effective-date changes can create a new plan ID while retaining old history; use the returned ID.
