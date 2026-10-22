/**
 * Reproduces pg's "Calling client.query() when the client is already executing a query is deprecated" warning
 * and checks that `SerialTransactionPrismaPg` (src/api/lib/prisma-adapter.ts) prevents it. Runs read-only
 * queries on a throwaway copy of the development database (created with pg_dump, dropped afterwards).
 *
 *   npx tsx scripts/pg-concurrency-check.ts
 *
 * Counts every `client.query()` that pg would queue behind a busy client (the exact condition of the warning,
 * which pg itself prints only once per process), per scenario, with the stock adapter and with ours.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/api/generated/prisma/client";
import { SerialTransactionPrismaPg } from "../src/api/lib/prisma-adapter";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const DB = `wh_pgcheck_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

// The same condition pg checks before printing the deprecation (lib/client.js).
let queued = 0;
type QueueingClient = pg.Client & { _queryQueue?: unknown[]; pipeline?: boolean };
const originalQuery = pg.Client.prototype.query as (...args: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function (this: QueueingClient, ...args: unknown[]) {
  if ((this._queryQueue?.length ?? 0) > 0 && !this.pipeline) queued += 1;
  return originalQuery.apply(this, args);
};
let warnings = 0;
process.on("warning", (warning) => {
  if (warning.message.includes("already executing a query")) warnings += 1;
});

const include = { users: true, habitants: true, shops: true, places: true } as const;
type Db = PrismaClient;
const scenarios: [string, (db: Db) => Promise<unknown>][] = [
  ["outside a transaction: Promise.all of 4 queries", (db) => Promise.all([1, 2, 3, 4].map(() => db.$queryRaw`SELECT pg_sleep(0.02)::text AS slept`))],
  ["interactive transaction: Promise.all of 3 queries on tx", (db) => db.$transaction(async (tx) => Promise.all([1, 2, 3].map(() => tx.$queryRaw`SELECT pg_sleep(0.02)::text AS slept`)))],
  ["interactive transaction: one findFirst with 4 included relations", (db) => db.$transaction(async (tx) => tx.household.findFirst({ include }))],
  ["array transaction: findFirst with 4 included relations", (db) => db.$transaction([db.household.findFirst({ include }), db.habitant.count()])],
  ["interactive transaction: sequential awaits", (db) => db.$transaction(async (tx) => {
    await tx.habitant.count();
    await tx.shop.count();
    return tx.place.count();
  })],
];

async function run(label: string, db: Db) {
  console.log(`\n${label}`);
  const results: unknown[] = [];
  let total = 0;
  for (const [name, scenario] of scenarios) {
    queued = 0;
    results.push(JSON.stringify(await scenario(db), (_key, value) => (typeof value === "bigint" ? String(value) : value)));
    console.log(`  ${queued === 0 ? "ok    " : "QUEUED"} ${name}: ${queued} queued`);
    total += queued;
  }
  return { results, total };
}

let failures = 0;
try {
  await admin(`CREATE DATABASE "${DB}"`);
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-acl "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], {
    env: { ...process.env, SRC: BASE_URL, DST: testUrl },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const stock = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  const before = await run("stock PrismaPg", stock);
  await stock.$disconnect();
  console.log(`  pg deprecation warnings printed: ${warnings}`);

  const serial = new PrismaClient({ adapter: new SerialTransactionPrismaPg({ connectionString: testUrl }) });
  const after = await run("SerialTransactionPrismaPg", serial);
  await serial.$disconnect();

  const same = before.results.every((result, index) => result === after.results[index]);
  console.log(`\nstock adapter queued ${before.total}, serial adapter queued ${after.total}; same results: ${same}`);
  if (!same || after.total !== 0) failures += 1;
} finally {
  await admin(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
}
console.log(failures === 0 ? "\nPASS" : "\nFAIL");
process.exit(failures === 0 ? 0 : 1);
