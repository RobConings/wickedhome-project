import { todayIn } from "@/types/dates";
import { db } from "../lib/db";
import { generateInstances, horizon } from "./expense-instances";
import { fromCategory, fromDate, fromKind, fromMethod, fromPayerType, fromStatus, recurringInclude, toDate } from "./expense-rows";
import { mapSubscription, type LegacySubscription, type MappedRecurringExpense } from "./subscription-mapping";

/*
 * One-off data migration (Finance phase 1): every subscription becomes a recurring expense, and bills that
 * were split get payer SPLIT (the rest is JOINT by default). Idempotent: a subscription that already has a
 * recurring expense (`legacySubscriptionId`) is skipped. The `subscriptions` table is left as it is.
 * Run through scripts/migrate-subscriptions-to-expenses.ts.
 */

/** `12345` → `€ 123,45` for the log. */
const formatCurrencyPlain = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export type MigrationResult ={ created: number; skipped: number; splitBills: number; lines: string[] };

function describe(mapped: MappedRecurringExpense, payerName: string | null): string {
  const payer = mapped.payerType === "person" ? `PERSON ${payerName ?? mapped.payerHabitantId}` : "JOINT";
  return [
    mapped.payee,
    formatCurrencyPlain(mapped.amountCents),
    mapped.rrule,
    `next ${mapped.startDate}`,
    `kind ${mapped.kind.toUpperCase()}`,
    `status ${mapped.status.toUpperCase()}`,
    `payer ${payer}`,
    `method ${mapped.paymentMethod?.toUpperCase() ?? "not set"}`,
    mapped.iban ? `iban ${mapped.iban}` : null,
    mapped.structuredCommunication ? `ogm ${mapped.structuredCommunication}` : null,
    mapped.reference ? `reference "${mapped.reference}"` : null,
    mapped.notes ? `notes "${mapped.notes.replace(/\n/g, " / ")}"` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function migrateSubscriptionsToExpenses({ dryRun, today = todayIn() }: { dryRun: boolean; today?: string }): Promise<MigrationResult> {
  const lines: string[] = [];
  const [rows, migrated, habitants] = await Promise.all([
    db.subscription.findMany({ orderBy: [{ householdId: "asc" }, { name: "asc" }] }),
    db.recurringExpense.findMany({ where: { legacySubscriptionId: { not: null } }, select: { legacySubscriptionId: true } }),
    db.habitant.findMany({ select: { id: true, name: true } }),
  ]);
  const done = new Set(migrated.map((row) => row.legacySubscriptionId));
  const nameOf = new Map(habitants.map((habitant) => [habitant.id, habitant.name]));
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const legacy: LegacySubscription = {
      ...row,
      nextRenewalOn: fromDate(row.nextRenewalOn),
      trialEndsOn: row.trialEndsOn ? fromDate(row.trialEndsOn) : null,
    };
    const mapped = mapSubscription(legacy, today);
    const text = describe(mapped, mapped.payerHabitantId ? (nameOf.get(mapped.payerHabitantId) ?? null) : null);
    if (done.has(row.id)) {
      skipped += 1;
      lines.push(`skip (already migrated): ${text}`);
      continue;
    }
    lines.push(`${dryRun ? "would create" : "create"}: ${text}`);
    if (dryRun) continue;

    await db.$transaction(async (tx) => {
      const recurring = await tx.recurringExpense.create({
        data: {
          householdId: row.householdId,
          legacySubscriptionId: mapped.legacySubscriptionId,
          payee: mapped.payee,
          amountCents: mapped.amountCents,
          category: fromCategory(mapped.category),
          kind: fromKind(mapped.kind),
          status: fromStatus(mapped.status),
          rrule: mapped.rrule,
          startDate: toDate(mapped.startDate),
          endDate: mapped.endDate ? toDate(mapped.endDate) : null,
          paymentMethod: fromMethod(mapped.paymentMethod),
          iban: mapped.iban,
          structuredCommunication: mapped.structuredCommunication,
          reference: mapped.reference,
          payerType: fromPayerType(mapped.payerType),
          payerHabitantId: mapped.payerHabitantId,
          websiteUrl: mapped.websiteUrl,
          trialEndsOn: mapped.trialEndsOn ? toDate(mapped.trialEndsOn) : null,
          remindDaysBefore: mapped.remindDaysBefore,
          candidateToCancel: mapped.candidateToCancel,
          notes: mapped.notes,
          paymentAccountId: mapped.paymentAccountId,
          // Paused and ended ones get no instances.
          generatedUntil: mapped.status === "active" ? null : toDate(today),
        },
        include: recurringInclude,
      });
      if (mapped.status === "active") await generateInstances(tx, recurring, mapped.startDate, horizon(today));
    });
    created += 1;
  }

  // Bills that were split keep their shares and become SPLIT; everything else is JOINT (the column default).
  const splitWhere = { payerType: "JOINT" as const, shares: { some: {} } };
  const splitBills = await db.expense.count({ where: splitWhere });
  if (splitBills > 0) {
    lines.push(`${dryRun ? "would set" : "set"} payer SPLIT on ${splitBills} split expense(s)`);
    if (!dryRun) await db.expense.updateMany({ where: splitWhere, data: { payerType: "SPLIT" } });
  }
  const jointBills = await db.expense.count({ where: { recurringExpenseId: null, payerType: "JOINT" } });
  lines.push(`one-off expenses with payer JOINT: ${jointBills}${dryRun ? "" : " (unchanged)"}`);

  lines.push(`${rows.length} subscription(s): ${dryRun ? "would create" : "created"} ${dryRun ? rows.length - skipped : created}, skipped ${skipped}`);
  return { created, skipped, splitBills, lines };
}
