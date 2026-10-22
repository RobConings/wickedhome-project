/**
 * Runtime check of settling the month's contributions (docs/FINANCE.md, "Contributions: settling the month") on
 * a throwaway copy of the development database (pg_dump → a new database, dropped afterwards). Never touches
 * the real data. Runs the money service in this process against the copy:
 *
 *   npx tsx scripts/money-settlement-runtime-check.ts
 *
 * Needs the household's joint account "Fortis gezamelijk" with plans for Clara and Rob and a correction on
 * 3 Oct 2026 (as in the dev data). Records Clara's € 2.000 on 1 Oct (before the correction): the balance stays
 * the same, Clara is € 800 over, Rob € 1.450 short, the netting alternative and the coverage check; then takes
 * € 800 back (status done, balance − € 800), keeps a later surplus as extra, records a direct payment (balance
 * unchanged) and updates the plans to the suggested amounts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env");
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL missing");
const DB = `wh_money_check_${process.pid}`;
const testUrl = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${DB}`;
  return url.toString();
})();
const MONTH = "2026-10";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function sql<T = Record<string, unknown>>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

const eur = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
const nl = JSON.parse(readFileSync("src/features/money/locales/nl.json", "utf8")) as Record<string, Record<string, string>>;
const say = (key: string, values: Record<string, string>) => {
  const [group, name] = key.split(".") as [string, string];
  return (nl[group]?.[name] ?? key).replace(/\{\{(\w+)\}\}/g, (_, field: string) => values[field] ?? `{{${field}}}`);
};

async function main() {
  await sql(BASE_URL as string, `CREATE DATABASE "${DB}"`);
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-acl "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], {
    env: { ...process.env, SRC: BASE_URL, DST: testUrl },
  });
  process.env.DATABASE_URL = testUrl;

  const money = await import("../src/api/money/money.service");
  const { settleAccount, contributionCoverage, personSettlement } = await import("../src/features/money/types/contribution-settlement");

  const [account] = await sql<{ id: string; householdId: string }>(testUrl, `select id, "householdId" from payment_accounts where name = 'Fortis gezamelijk' and kind = 'JOINT'`);
  if (!account) throw new Error("No joint account 'Fortis gezamelijk' in the dev data");
  const hh = account.householdId;
  const people = await sql<{ id: string; name: string }>(testUrl, `select id, name from habitants where "householdId" = $1`, [hh]);
  const clara = people.find((item) => item.name.startsWith("Clara"));
  const rob = people.find((item) => item.name.startsWith("Rob"));
  const [user] = await sql<{ id: string }>(testUrl, `select id from users where "householdId" = $1 order by "createdAt" limit 1`, [hh]);
  if (!clara || !rob || !user) throw new Error("Clara, Rob or a user missing");
  const name = (id: string) => people.find((item) => item.id === id)?.name.split(" ")[0] ?? id;

  const monthOf = async () => {
    const data = await money.getMoneyMonth(hh, MONTH);
    const joint = data.accounts.find((item) => item.id === account.id);
    if (!joint) throw new Error("account missing");
    const settlement = settleAccount(account.id, data.contributions);
    const coverage = contributionCoverage({
      month: MONTH,
      today: data.today,
      people: data.contributions.filter((row) => row.accountId === account.id).map(personSettlement),
      costs: data.jointCosts,
      balanceCents: joint.balanceCents,
      incomes: data.income.people.filter((row) => row.key !== "joint").map((row) => ({ habitantId: row.key, cents: row.totalCents })),
    });
    const person = (id: string) => settlement.people.find((item) => item.habitantId === id);
    return { data, joint, settlement, coverage, person };
  };

  // ── Before ──
  const start = await monthOf();
  const b0 = start.joint.balanceCents;
  console.log(`Balance before: ${eur(b0)} (last correction ${start.joint.lastCorrection?.date})`);

  // ── Clara € 2.000 on 1 Oct, before the 3 Oct correction ──
  await money.recordTransfer(hh, user.id, { from: `habitant:${clara.id}`, toAccountId: account.id, date: "2026-10-01", amountCents: 200_000, note: null });
  const one = await monthOf();
  check("balance unchanged by a contribution before the correction", one.joint.balanceCents === b0, eur(one.joint.balanceCents));
  const c1 = one.person(clara.id);
  const r1 = one.person(rob.id);
  check("Clara € 800 too much", c1?.status === "over" && c1.overCents === 80_000, say("contributions.over", { amount: eur(c1?.overCents ?? 0) }));
  check("Clara's entry marked as absorbed by the correction", c1?.entries[0]?.absorbed === true);
  check("Rob still € 1.450", r1?.status === "short" && r1.shortCents === 145_000, say("contributions.short", { amount: eur(r1?.shortCents ?? 0) }));
  const label = "Fortis gezamelijk";
  for (const step of one.settlement.steps) {
    console.log(
      "  ",
      step.kind === "transfer"
        ? say("settlement.transfer", { name: name(step.habitantId), account: label, amount: eur(step.amountCents) })
        : say("settlement.takeBack", { name: name(step.habitantId), amount: eur(step.amountCents) }),
    );
  }
  const direct = one.settlement.netting?.direct[0];
  const rest = one.settlement.netting?.steps[0];
  check(
    "netting: Rob pays Clara € 800 directly and transfers € 650",
    direct?.fromHabitantId === rob.id && direct.toHabitantId === clara.id && direct.amountCents === 80_000 && rest?.amountCents === 65_000,
    direct && rest ? say("settlement.nettingSimple", { from: name(direct.fromHabitantId), to: name(direct.toHabitantId), amount: eur(direct.amountCents), rest: eur(rest.amountCents), account: label }) : "",
  );
  check(
    "end result Clara € 1.200 · Rob € 1.450 · total € 2.650",
    one.settlement.totalCents === 265_000,
    say("settlement.endResult", {
      people: one.settlement.endResult.map((item) => `${name(item.habitantId)} ${eur(item.amountCents)}`).join(" · "),
      total: eur(one.settlement.totalCents),
      account: label,
    }),
  );
  const cov = one.coverage;
  const outgoings = one.data.jointOutgoings;
  console.log(`   costs: ${eur(cov.paidCents)} paid + ${eur(cov.toPayCents)} to pay (joint outgoings card: ${eur(outgoings.paidCents)} + ${eur(outgoings.upcomingCents)})`);
  check("coverage short with the real joint costs", cov.status === "short", say("coverage.short", { amount: eur(-cov.differenceCents) }));
  check("coverage costs match the joint outgoings card", cov.costsCents === outgoings.paidCents + outgoings.upcomingCents);
  if (cov.projection) {
    console.log(
      `   ${say("coverage.projectionTitle", {})}: ${eur(cov.projection.endCents)} — ${say("coverage.projectionDetail", { balance: eur(cov.projection.balanceCents), receive: eur(cov.projection.toReceiveCents), pay: eur(cov.projection.toPayCents) })}`,
    );
    if (cov.projection.belowZeroOn) console.log(`   ${say("coverage.belowZero", { date: cov.projection.belowZeroOn, amount: eur(cov.projection.lowestCents) })}`);
  }
  check("projection present for the current month", cov.projection !== null);
  for (const option of [cov.suggestions?.byPlan, cov.suggestions?.byIncome]) {
    if (option) console.log(`   suggestion: ${option.map((item) => `${name(item.habitantId)} ${eur(item.currentCents)} → ${eur(item.suggestedCents)}`).join(" · ")}`);
  }
  check("suggested plans cover the costs", (cov.suggestions?.byPlan.reduce((sum, item) => sum + item.suggestedCents, 0) ?? 0) >= cov.costsCents);

  // ── Take back € 800 today ──
  await money.takeBackContribution(hh, user.id, { habitantId: clara.id, accountId: account.id, date: one.data.today, amountCents: 80_000, note: null });
  const two = await monthOf();
  const c2 = two.person(clara.id);
  check("take back: Clara done, net € 1.200", c2?.status === "done" && c2.transferredCents === 120_000);
  check("take back: balance − € 800", two.joint.balanceCents === b0 - 80_000, eur(two.joint.balanceCents));
  const line = two.data.accountMonths.find((item) => item.accountId === account.id)?.lines.find((item) => item.type === "contribution" && item.amountCents === -80_000);
  check("history: a negative contribution of Clara (shown as taken back)", line?.habitantId === clara.id && !line.counterpartHabitantId);
  check("only Rob's transfer left", two.settlement.steps.length === 1 && two.settlement.steps[0]?.habitantId === rob.id && two.settlement.netting === null);

  // ── Keep a later surplus as extra ──
  await money.recordTransfer(hh, user.id, { from: `habitant:${clara.id}`, toAccountId: account.id, date: two.data.today, amountCents: 10_000, note: null });
  await money.setKeptExtra(hh, user.id, { habitantId: clara.id, accountId: account.id, month: MONTH, amountCents: 10_000 });
  const three = await monthOf();
  const c3 = three.person(clara.id);
  check("keep as extra: done, € 100 kept, still in the balance", c3?.status === "done" && c3.keptExtraCents === 10_000 && three.joint.balanceCents === b0 - 70_000);
  await money.setKeptExtra(hh, user.id, { habitantId: clara.id, accountId: account.id, month: MONTH, amountCents: 0 });
  check("undo keep as extra: flagged again", (await monthOf()).person(clara.id)?.status === "over");

  // ── Direct payment Rob → Clara € 100: balance unchanged, Clara done again ──
  await money.recordDirectPayment(hh, user.id, { fromHabitantId: rob.id, toHabitantId: clara.id, accountId: account.id, date: two.data.today, amountCents: 10_000 });
  const four = await monthOf();
  check("direct payment: balance unchanged", four.joint.balanceCents === b0 - 70_000);
  check("direct payment: Clara done, Rob € 1.350 short", four.person(clara.id)?.status === "done" && four.person(rob.id)?.shortCents === 135_000);
  const pair = four.data.accountMonths.find((item) => item.accountId === account.id)?.lines.filter((item) => item.counterpartHabitantId) ?? [];
  check("direct payment: two linked lines", pair.length === 2);
  if (pair[0]) {
    await money.deleteEntry(hh, pair[0].sourceId);
    check("deleting one line deletes the pair", ((await monthOf()).data.accountMonths.find((item) => item.accountId === account.id)?.lines.filter((item) => item.counterpartHabitantId) ?? []).length === 0);
  }

  // ── Update plans to the suggestion ──
  const suggestion = (await monthOf()).coverage.suggestions?.byPlan;
  if (suggestion) {
    await money.setPlanAmounts(hh, { month: MONTH, amounts: suggestion.map((item) => ({ planId: item.planId, amountCents: item.suggestedCents })) });
    const five = await monthOf();
    check("update plans: contributions now cover the joint costs", five.coverage.status !== "short", `${eur(five.coverage.plannedCents)} vs ${eur(five.coverage.costsCents)}`);
  }
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error(error);
  })
  .finally(async () => {
    await sql(BASE_URL as string, `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch((error: unknown) => console.error("drop failed", error));
    console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
