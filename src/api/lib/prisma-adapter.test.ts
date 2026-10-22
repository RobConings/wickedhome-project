/**
 * Guards the transaction wrapper in prisma-adapter.ts against changes in @prisma/adapter-pg. Runs the real
 * adapter code on a fake pg pool (no database): if a Prisma upgrade changes the transaction's shape so the
 * wrapper no longer intercepts its queries, these tests fail. After upgrading Prisma, also run
 * `npx tsx scripts/pg-concurrency-check.ts` against a throwaway database.
 *
 *   npx tsx --test src/api/lib/prisma-adapter.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { SerialTransactionPrismaPg, serializeTransaction } from "./prisma-adapter";

/** A pool whose one connection answers every query after a few ms and records how many ran at once. */
function fakePool() {
  const stats = { running: 0, maxRunning: 0, sql: [] as string[] };
  const connection = {
    query: async (config: string | { text: string }) => {
      stats.sql.push(typeof config === "string" ? config : config.text);
      stats.running += 1;
      stats.maxRunning = Math.max(stats.maxRunning, stats.running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      stats.running -= 1;
      return { fields: [], rows: [], rowCount: 0 };
    },
    on: () => connection,
    removeListener: () => connection,
    release: () => undefined,
  };
  const pool = new pg.Pool();
  pool.connect = (() => Promise.resolve(connection)) as unknown as pg.Pool["connect"];
  return { pool, stats };
}

const query = (sql: string) => ({ sql, args: [], argTypes: [] });

async function concurrentQueries(Adapter: typeof PrismaPg) {
  const { pool, stats } = fakePool();
  const adapter = await new Adapter(pool).connect();
  const tx = await adapter.startTransaction();
  await Promise.all([tx.queryRaw(query("SELECT 1")), tx.queryRaw(query("SELECT 2")), tx.executeRaw(query("UPDATE x")), tx.createSavepoint?.("s1")]);
  return stats;
}

describe("SerialTransactionPrismaPg", () => {
  it("the stock adapter hands one connection several queries at once (why the wrapper exists)", async () => {
    // If this starts failing, @prisma/adapter-pg serialises transactions itself: the wrapper can go.
    const stats = await concurrentQueries(PrismaPg);
    assert.ok(stats.maxRunning > 1, `expected concurrent queries, got ${stats.maxRunning}`);
  });

  it("runs a transaction's queries, executes and savepoints one at a time", async () => {
    const stats = await concurrentQueries(SerialTransactionPrismaPg);
    assert.equal(stats.maxRunning, 1);
    assert.deepEqual(stats.sql, ["BEGIN", "SELECT 1", "SELECT 2", "UPDATE x", "SAVEPOINT s1"]);
  });

  it("keeps the transaction's methods the wrapper relies on", async () => {
    const { pool } = fakePool();
    const tx = await (await new PrismaPg(pool).connect()).startTransaction();
    for (const method of ["queryRaw", "executeRaw", "commit", "rollback"] as const) {
      assert.equal(typeof tx[method], "function", method);
    }
  });
});

describe("serializeTransaction", () => {
  it("keeps going after a failed query and passes the failure on", async () => {
    const order: string[] = [];
    const tx = serializeTransaction({
      queryRaw: async ({ sql }: { sql: string }) => {
        order.push(sql);
        if (sql === "bad") throw new Error("boom");
        return { columnNames: [], columnTypes: [], rows: [] };
      },
      executeRaw: async () => 0,
    } as unknown as Parameters<typeof serializeTransaction>[0]);
    const results = await Promise.allSettled([tx.queryRaw(query("bad")), tx.queryRaw(query("good"))]);
    assert.equal(results[0]?.status, "rejected");
    assert.equal(results[1]?.status, "fulfilled");
    assert.deepEqual(order, ["bad", "good"]);
  });
});
