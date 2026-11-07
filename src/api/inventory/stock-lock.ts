import type { Prisma } from "../lib/db";

/** Serialize stock changes and group merges within a household until the transaction ends. */
export async function lockStock(tx: Prisma.TransactionClient, householdId: string): Promise<void> {
  // The lock function returns PostgreSQL `void`, which Prisma cannot deserialize. Return an integer
  // from the function's row instead, keeping the lock and the query on the transaction's connection.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`inventory:${householdId}`}, 0))`;
}
