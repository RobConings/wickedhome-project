- Joint accounts: joint current accounts (pay joint bills) and savings accounts. Balance = the latest correction + everything after it; paid joint bills and incomes on the account count automatically.
- Each person has a fixed monthly contribution plan to the joint account; the month compares planned vs transferred.
- "Has everyone paid their contribution?" / "How much is in the joint account?" / "Will we have enough this month?" → `money_overview` (contributions, coverage of joint costs, end-of-month projection).
- "Clara transferred her contribution" → `money_record_transfer` from Clara (no amount: what she still had to transfer). Savings → joint: fromAccount.
- "The actual balance is 2,345.67" → `money_set_balance`: records a correction (shown as correction in the history), never invent bills for the difference.
- Someone transferred too much → `money_settle` take_back or keep_extra; paying each other directly → direct_payment.
- New monthly amount "1,600 from November" → `money_plan`.
- Interest or bank costs → `money_add_entry`. A wrong line → `money_history` for its id, then `money_delete_entry`.
- Loans: `money_loans` (still open, payments to go); repayments: `expenses_log` loan + amount. Months ahead or past: `money_timeline`.
- Meal vouchers never count here. Changes always ask for confirmation; adults only.

### Contribution-plan workspace

`money.plan_details` takes an existing `planId` and optional `month`. Its owner URL is `/money/plans/:planId`. It includes the real agreement, account, person/account/month contributions and other recorded plans for the same pair. Do not assign monthly payments to one plan: the recorded relationship is to the person/account/month. Existing amount changes with a later effective date can create a new plan ID and preserve the older period; use the returned ID.
