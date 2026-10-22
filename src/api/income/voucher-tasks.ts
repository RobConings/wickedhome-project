import type { VoucherBalance } from "@/features/income/types/income";
import type { Locale } from "@/types/common";
import { formatDate } from "@/types/date-format";
import { db } from "../lib/db";
import { completeLinkedTask, listLinkedTasks, removeLinkedTask, upsertLinkedTask, type LinkedTaskState } from "../tasks/linked-tasks";
import { getVoucherBalances } from "./income.service";

/*
 * "Use € 23,40 meal vouchers before 03/10/2026": a linked task (tasks feature) per person whose vouchers expire
 * within VOUCHER_WARN_DAYS, origin `vouchers:<habitantId>:<expiry date>`, assigned to that person, due on the
 * expiry date. The job `income.voucher-tasks` keeps them in step every morning: the title follows what is left;
 * once the vouchers are used (nothing left on that date) the task is done, once they have expired it is removed.
 * A task someone closed is never touched again (linked-task rules).
 */

export const VOUCHER_ORIGIN = "vouchers";
export const voucherTaskId = (habitantId: string, date: string) => `${habitantId}:${date}`;

const MONEY_LOCALE: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };

/** "Use € 23,40 meal vouchers before 03/10/2026" / "€ 23,40 maaltijdcheques gebruiken vóór 03/10/2026". */
export function voucherTaskTitle(amountCents: number, date: string, locale: string): string {
  const lang: Locale = locale === "nl" ? "nl" : "en";
  // Plain spaces: Intl puts no-break spaces in amounts.
  const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
  const amount = plain(new Intl.NumberFormat(MONEY_LOCALE[lang], { style: "currency", currency: "EUR" }).format(amountCents / 100));
  const day = formatDate(date, lang);
  return lang === "nl" ? `${amount} maaltijdcheques gebruiken vóór ${day}` : `Use ${amount} meal vouchers before ${day}`;
}

export type VoucherTaskPlan = {
  upserts: { id: string; habitantId: string; date: string; title: string }[];
  /** Open tasks no longer wanted: `done` (used up in time) or `removed` (expired). */
  settle: { id: string; outcome: "done" | "removed" }[];
};

/** Pure: which voucher tasks should exist for these balances, and what happens to the others. */
export function planVoucherTasks(
  balances: readonly Pick<VoucherBalance, "habitantId" | "expiringSoon">[],
  existing: readonly Pick<LinkedTaskState, "originId" | "originDate" | "status">[],
  today: string,
  locale: string,
): VoucherTaskPlan {
  const upserts = balances.flatMap((balance) =>
    balance.expiringSoon && balance.expiringSoon.amountCents > 0
      ? [
          {
            id: voucherTaskId(balance.habitantId, balance.expiringSoon.date),
            habitantId: balance.habitantId,
            date: balance.expiringSoon.date,
            title: voucherTaskTitle(balance.expiringSoon.amountCents, balance.expiringSoon.date, locale),
          },
        ]
      : [],
  );
  const wanted = new Set(upserts.map((item) => item.id));
  const settle = existing
    .filter((task) => task.status === "open" && !wanted.has(task.originId))
    .map((task) => ({ id: task.originId, outcome: task.originDate && task.originDate < today ? ("removed" as const) : ("done" as const) }));
  return { upserts, settle };
}

async function householdLocale(householdId: string): Promise<string> {
  const users = await db.user.findMany({ where: { householdId }, select: { locale: true, role: true }, orderBy: { createdAt: "asc" } });
  return (users.find((user) => user.role === "OWNER") ?? users[0])?.locale ?? "en";
}

/** Reconciles every household's voucher tasks. Safe to run twice. */
export async function syncVoucherTasks({ today, signal, log }: { today: string; signal?: AbortSignal; log?: (message: string) => void }) {
  const households = await db.income.findMany({ where: { kind: "MEAL_VOUCHERS" }, distinct: ["householdId"], select: { householdId: true } });
  const withTasks = await db.task.findMany({ where: { originType: VOUCHER_ORIGIN, status: "OPEN" }, distinct: ["householdId"], select: { householdId: true } });
  const ids = [...new Set([...households, ...withTasks].map((row) => row.householdId))];
  let changed = 0;
  for (const householdId of ids) {
    if (signal?.aborted) break;
    const [balances, existing, locale] = [await getVoucherBalances(householdId, today), await listLinkedTasks(householdId, VOUCHER_ORIGIN), await householdLocale(householdId)];
    const plan = planVoucherTasks(balances, existing, today, locale);
    for (const item of plan.upserts) {
      const result = await upsertLinkedTask({
        householdId,
        origin: { type: VOUCHER_ORIGIN, id: item.id, date: item.date, href: "/income" },
        title: item.title,
        type: "errand",
        dueDate: item.date,
        ...(!existing.some((task) => task.originId === item.id) && { assigneeIds: [item.habitantId] }),
      });
      if (result.action !== "unchanged") {
        changed += 1;
        log?.(`${item.title}: ${result.action}`);
      }
    }
    for (const item of plan.settle) {
      const done =
        item.outcome === "done"
          ? await completeLinkedTask({ householdId, type: VOUCHER_ORIGIN, id: item.id })
          : await removeLinkedTask({ householdId, type: VOUCHER_ORIGIN, id: item.id });
      if (done) {
        changed += 1;
        log?.(`${item.id}: ${item.outcome}`);
      }
    }
  }
  return { summary: changed === 0 ? "Voucher tasks up to date" : `${changed} voucher task${changed === 1 ? "" : "s"} changed` };
}
