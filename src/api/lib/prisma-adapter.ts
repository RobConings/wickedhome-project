import { PrismaPg } from "@prisma/adapter-pg";

type PgAdapter = Awaited<ReturnType<PrismaPg["connect"]>>;
type PgTransaction = Awaited<ReturnType<PgAdapter["startTransaction"]>>;

/**
 * Runs the queries of one transaction strictly one after the other.
 *
 * A Prisma transaction (interactive `$transaction(async (tx) => …)` or the array form) holds a single `pg`
 * connection. Prisma's query interpreter fetches the relations of an `include` (and `Promise.all` in app code
 * does the same) concurrently, so three or more queries could be handed to that one `pg` client at once. `pg`
 * queues them, but calling `client.query()` while the client is busy is deprecated ("will be removed in
 * pg@9.0"). One connection can only run one query at a time anyway, so queueing them here costs nothing.
 */
export function serializeTransaction<T extends PgTransaction>(tx: T): T {
  let tail: Promise<unknown> = Promise.resolve();
  const queue = <R>(work: () => Promise<R>): Promise<R> => {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };
  const queryRaw = tx.queryRaw.bind(tx);
  const executeRaw = tx.executeRaw.bind(tx);
  // Own properties shadow the prototype methods; savepoints call this.executeRaw, so they queue too.
  tx.queryRaw = (query) => queue(() => queryRaw(query));
  tx.executeRaw = (query) => queue(() => executeRaw(query));
  return tx;
}

/** `PrismaPg` whose transactions never hand a busy `pg` client a second query (see `serializeTransaction`). */
export class SerialTransactionPrismaPg extends PrismaPg {
  override async connect(): Promise<PgAdapter> {
    const adapter = await super.connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async (isolationLevel) => serializeTransaction(await startTransaction(isolationLevel));
    return adapter;
  }
}
