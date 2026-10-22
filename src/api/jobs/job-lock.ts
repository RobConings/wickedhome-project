import { createHash } from "node:crypto";
import pg from "pg";
import { config } from "../lib/config";

/**
 * One run per job at a time, across processes on the same database: a Postgres session-level advisory lock
 * (`pg_try_advisory_lock`) keyed on a hash of the job id.
 *
 * Why a dedicated `pg` connection and not a Prisma raw query: a session lock belongs to the connection that
 * took it, and Prisma's pool may run the lock and the unlock on different connections. An interactive
 * Prisma transaction would pin one connection, but keeps a transaction open for the whole run and has its
 * own timeout. So each held lock owns one connection from a small separate pool, for the duration of the
 * run; `pg_advisory_unlock` releases it in `finally`, and if the process dies the connection closes and
 * Postgres releases the lock by itself.
 */

/** Releases a held lock. Never throws. */
export type ReleaseLock = () => Promise<void>;

export interface JobLock {
  /** Takes the job's lock without waiting: the release function, or null when someone else holds it. */
  tryAcquire(jobId: string): Promise<ReleaseLock | null>;
}

/** Signed 64-bit key from the job id (namespaced, so other apps' advisory locks never collide by accident). */
export function lockKey(jobId: string): bigint {
  const digest = createHash("sha256").update(`wickedhome:job:${jobId}`).digest();
  return digest.readBigInt64BE(0);
}

/** Few connections: one per job running at the same moment, plus headroom. */
const POOL_SIZE = 4;

let pool: pg.Pool | null = null;

function lockPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: POOL_SIZE,
      idleTimeoutMillis: 30_000,
      application_name: "wickedhome-jobs",
    });
    // An idle connection that drops must not crash the process (pg emits 'error' on the pool).
    pool.on("error", (error) => console.error("[jobs] lock connection error", error));
  }
  return pool;
}

export const advisoryLock: JobLock = {
  async tryAcquire(jobId) {
    const key = lockKey(jobId).toString();
    const client = await lockPool().connect();
    let locked: boolean;
    try {
      const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [key]);
      locked = rows[0]?.locked === true;
    } catch (error) {
      client.release(true);
      throw error;
    }
    if (!locked) {
      client.release();
      return null;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]);
        client.release();
      } catch (error) {
        // Destroying the connection releases the lock as well.
        console.error(`[jobs] could not unlock ${jobId}`, error);
        client.release(true);
      }
    };
  },
};

/** Closes the lock connections (shutdown, CLI). Held locks are released with them. */
export async function closeLockPool(): Promise<void> {
  const current = pool;
  pool = null;
  await current?.end().catch(() => undefined);
}
