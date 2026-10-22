import { registerJob } from "../jobs/job-registry";
import { autoPayDirectDebits } from "./auto-pay";

/**
 * Direct debits are collected by the creditor: every morning, unpaid direct-debit expenses due today (or
 * missed in the last few days) are marked paid on their due date. Undo works as for any payment.
 */
registerJob({
  id: "expenses.auto-pay",
  schedule: "10 6 * * *",
  titleKey: "expenses:jobs.autoPay.title",
  descriptionKey: "expenses:jobs.autoPay.description",
  runOnStartupIfMissed: true,
  run: async ({ signal, log }) => {
    const { summary } = await autoPayDirectDebits({ signal, log });
    return { summary };
  },
});
