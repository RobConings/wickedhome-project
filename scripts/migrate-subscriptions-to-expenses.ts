/**
 * Finance phase 1: turns every subscription into a recurring expense (docs/FINANCE.md, "Migration of
 * existing data"). Idempotent: already migrated subscriptions are skipped. The subscriptions table stays.
 *
 *   npx tsx --env-file=.env scripts/migrate-subscriptions-to-expenses.ts --dry-run   # print the mapping only
 *   npx tsx --env-file=.env scripts/migrate-subscriptions-to-expenses.ts             # migrate
 *
 * Uses DATABASE_URL (from .env or the environment), like the app.
 */
import { migrateSubscriptionsToExpenses } from "../src/api/expenses/subscription-migration";
import { db } from "../src/api/lib/db";

const dryRun = process.argv.includes("--dry-run");

try {
  const database = new URL(process.env.DATABASE_URL ?? "postgresql://unknown/unknown").pathname.slice(1);
  console.log(`${dryRun ? "Dry run" : "Migrating"} on database "${database}"`);
  const result = await migrateSubscriptionsToExpenses({ dryRun });
  for (const line of result.lines) console.log(line);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
