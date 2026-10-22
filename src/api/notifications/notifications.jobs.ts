import { NOTIFICATION_RETENTION_DAYS } from "@/features/notifications/types/notifications";
import { registerJob } from "../jobs/job-registry";
import { db } from "../lib/db";
import { countUnread, pushOptionsFor } from "./notify";
import { pushToUser } from "./push-delivery";
import { listScheduledNotifiers } from "./scheduled-notifiers";

/** A push held by quiet hours is dropped (stays in the center) when it is older than this by the time they end. */
const HELD_MAX_AGE_MS = 18 * 3600_000;

/** Pushes what quiet hours held back, once they are over, if it is still unread and not too old. */
export async function deliverHeldPushes(now: Date, log: (message: string) => void): Promise<number> {
  const due = await db.notification.findMany({
    where: { pushHeldUntil: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, userId: true, kind: true, title: true, body: true, url: true, tag: true, urgent: true, readAt: true, createdAt: true },
  });
  let pushed = 0;
  for (const row of due) {
    await db.notification.update({ where: { id: row.id }, data: { pushHeldUntil: null } });
    if (row.readAt || now.getTime() - row.createdAt.getTime() > HELD_MAX_AGE_MS) continue;
    try {
      const outcome = await pushToUser(
        row.userId,
        { id: row.id, kind: row.kind, title: row.title, body: row.body, url: row.url, tag: row.tag, urgent: row.urgent, unread: await countUnread(row.userId) },
        pushOptionsFor(row),
      );
      if (outcome.sent > 0) {
        pushed += 1;
        await db.notification.update({ where: { id: row.id }, data: { pushedAt: new Date() } });
      }
    } catch (error) {
      log(`Held push ${row.id} failed: ${(error as Error).message}`);
    }
  }
  return pushed;
}

registerJob({
  id: "notifications.dispatch",
  schedule: "*/5 * * * *",
  titleKey: "notifications:jobs.dispatch.title",
  descriptionKey: "notifications:jobs.dispatch.description",
  timeoutMs: 4 * 60_000,
  run: async ({ signal, log }) => {
    const now = new Date();
    const held = await deliverHeldPushes(now, log);
    let sent = 0;
    const failed: string[] = [];
    for (const notifier of listScheduledNotifiers()) {
      if (signal.aborted) break;
      try {
        const count = await notifier.run({ now, signal, log });
        if (count > 0) log(`${notifier.id}: ${count}`);
        sent += count;
      } catch (error) {
        failed.push(notifier.id);
        log(`${notifier.id} failed: ${(error as Error).message}`);
      }
    }
    const summary = `${sent} sent, ${held} held pushes delivered`;
    if (failed.length > 0) throw new Error(`${summary}; failed: ${failed.join(", ")}`);
    return { summary };
  },
});

registerJob({
  id: "notifications.prune",
  schedule: "10 4 * * *",
  titleKey: "notifications:jobs.prune.title",
  descriptionKey: "notifications:jobs.prune.description",
  runOnStartupIfMissed: true,
  run: async () => {
    const before = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 3600_000);
    const { count } = await db.notification.deleteMany({ where: { createdAt: { lt: before } } });
    return { summary: `${count} old notification${count === 1 ? "" : "s"} removed` };
  },
});
