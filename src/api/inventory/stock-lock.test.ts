import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { SerialTransactionPrismaPg } from "../lib/prisma-adapter";
import { lockStock } from "./stock-lock";

/** Real Prisma/pg adapter deserialization, with a fake wire result instead of a database. */
function client() {
  const queries: { text: string; values?: unknown[] }[] = [];
  const connection = {
    query: async (input: string | { text: string; values?: unknown[] }) => {
      const query = typeof input === "string" ? { text: input } : input;
      queries.push(query);
      if (!query.text.includes("pg_advisory_xact_lock")) return { fields: [], rows: [], rowCount: 0 };
      const supported = /SELECT 1 AS locked FROM pg_advisory_xact_lock/.test(query.text);
      return {
        fields: [{ name: supported ? "locked" : "pg_advisory_xact_lock", dataTypeID: supported ? 23 : 2278 }],
        rows: [[supported ? 1 : ""]], rowCount: 1,
      };
    },
    on: () => connection,
    removeListener: () => connection,
    release: () => undefined,
  };
  const pool = new pg.Pool();
  pool.connect = (() => Promise.resolve(connection)) as unknown as pg.Pool["connect"];
  return { db: new PrismaClient({ adapter: new SerialTransactionPrismaPg(pool) }), pool, queries };
}

describe("inventory transaction lock", () => {
  it("reproduces the reported void deserialization error with the old SQL", async () => {
    const { db, pool } = client();
    try {
      await assert.rejects(db.$transaction((tx) => tx.$queryRaw`SELECT pg_advisory_xact_lock(1)`),
        /Failed to deserialize column of type 'void'/);
    } finally {
      await db.$disconnect();
      await pool.end();
    }
  });

  it("acquires the lock without exposing void, on the transaction connection and with a bound household key", async () => {
    const { db, pool, queries } = client();
    try {
      await db.$transaction((tx) => lockStock(tx, "household'quoted"));
      assert.deepEqual(queries.map((query) => query.text), [
        "BEGIN",
        "SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))",
        "COMMIT",
      ]);
      assert.deepEqual(queries[1]?.values, ["inventory:household'quoted"]);
    } finally {
      await db.$disconnect();
      await pool.end();
    }
  });
});
