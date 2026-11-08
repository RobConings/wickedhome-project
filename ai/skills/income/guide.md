- Income sources (salary, holiday/year-end pay, vouchers, benefits) belong to a person or jointly. Fixed sources have amount history; variable sources need actual monthly amounts.
- Future-dated income remains expected, not received. Pass its date; the app determines status. One-offs: tax_return, green_certificates, gift, sale.
- "My meal vouchers were €160" → `income_record_variable`, kind meal_vouchers, person asking unless specified.
- "€1,240 tax refund due 30/10" → `income_record`, kind tax_return, date 2026-10-30; mark joint if specified.
- "Clara's salary arrived" → `income_record`, source "Clara's salary"; default to planned amount.
- Income received/expected this month or refund status → `income_list`. Variable income outstanding → `income_to_enter`.
- Raise a recurring amount effective January → `income_update_source` with amount and from date; stopping it → endDate.
- To correct a recorded amount, find its history ID via `income_list`, `income_delete` then record the correct amount.
- Vouchers are not bank balance; confirm every change. Only adults/owners see income.

### Meal vouchers
`income.vouchers` takes `person` with independently paged `receiptPage` and `spendingPage` (25 each). It returns existing FIFO/expiry balance and source IDs, as in `/income/vouchers/:personId`. Expiry refers to the original credit, not remaining unspent funds. Future credits stay expected; spending is actual personal expense share. Adult finance permissions apply. Read-only: no new income, expense or bank entry.
