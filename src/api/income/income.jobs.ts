import { todayIn } from "@/types/dates";
import { registerJob } from "../jobs/job-registry";
import { syncVoucherTasks } from "./voucher-tasks";

/** Meal vouchers about to expire get a "Use € … meal vouchers before …" task for their owner (voucher-tasks.ts). */
registerJob({
  id: "income.voucher-tasks",
  schedule: "45 6 * * *",
  titleKey: "income:jobs.voucherTasks.title",
  descriptionKey: "income:jobs.voucherTasks.description",
  runOnStartupIfMissed: true,
  run: ({ signal, log }) => syncVoucherTasks({ today: todayIn(), signal, log }),
});
