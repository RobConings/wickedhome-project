- Recurring incomes (sources: salary, holiday pay, year-end bonus, meal vouchers, benefit) belong to a person or are joint. Fixed ones have an amount history; variable ones (meal vouchers) need the actual amount each month.
- Received vs expected: an income dated after today is still expected (the app decides; just pass the date). One-offs: tax refund = tax_return, green certificates = green_certificates, gift, sale.
- "My meal vouchers were 160 euros" → `income_record_variable` amount 160, kind meal_vouchers (person = the one asking unless named).
- "The 1,240 euro tax refund is due on 30/10" → `income_record` kind tax_return, date 2026-10-30 (expected); "jointly ours" → joint.
- "Clara's salary has arrived" → `income_record` source "Clara's salary" (amount defaults to the planned one).
- "What income arrived this month?" / "Has the refund arrived?" → `income_list` (month: received vs expected per person, voucher balances).
- `income_to_enter`: variable incomes still to enter. Raise "2,450 from January" → `income_update_source` amount + from; stops → endDate.
- Wrong recorded amount: `income_delete` (id from income_list history) and record again.
- Meal vouchers are not bank money: never in balances. Every change asks for confirmation; only owners and adults see income.

### Meal-voucher workspace

`income.vouchers` takes a `person`, with independent `receiptPage` and `spendingPage` (25 records each). It returns the same current FIFO/expiry balance and actual source IDs as `/income/vouchers/:personId`. Credit expiry describes the original receipt, not its current unspent remainder. Future-dated income is not received. Spending is the person’s actual expense share. Adult finance permissions apply; this read creates no income, expense or bank entry.
