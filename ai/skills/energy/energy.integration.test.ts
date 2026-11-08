import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "@/api/lib/db";
import { shoppingSessionFixture as fixture } from "@/api/shopping/sessions-test-helpers";
import { createAppliance, updateAppliance, deleteAppliance, getAppliance, getEnergySummary } from "@/api/energy/energy.service";
import { applianceInputSchema } from "@/features/energy/types/energy";
import { energyDistribution, energyHierarchyError } from "@/features/energy/types/energy-distribution";
import { zonedMidnight } from "@/features/energy/types/energy-time";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import type { SessionUser } from "@/features/auth/types/auth";
import "@ai/skills";

const enabled = process.env.ENERGY_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });
const input = (name: string, parentApplianceId?: string | null) => applianceInputSchema.parse({ name, category: "other", carriers: ["electricity"], ...(parentApplianceId !== undefined ? { parentApplianceId } : {}) });

async function call(user: SessionUser, name: string, args: Record<string, unknown>, scope: "read" | "write" = "write") {
  const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    { user, tokenId: "energy-test", tokenName: "Energy test", scope }, new AbortController().signal) as {
      result?: { isError?: boolean; content: { text: string }[] }; error?: { message: string };
    };
  assert.ok(reply.result || reply.error);
  return reply.result ?? { isError: true, content: [{ text: reply.error!.message }] };
}

it("energy hierarchy validates ownership, carriers and cycles, preserves omitted edges, serializes competing edits and safely detaches children on removal", options, async (t) => {
  const f = await fixture(t);
  const parent = await createAppliance(f.home.id, input("Kitchen circuit"));
  const child = await createAppliance(f.home.id, input("Fridge", parent.id));
  assert.equal(child.parentApplianceId, parent.id);
  assert.equal((await updateAppliance(f.home.id, child.id, input("Renamed fridge"))).parentApplianceId, parent.id);
  await assert.rejects(updateAppliance(f.home.id, parent.id, input("Kitchen", child.id)), /hierarchy/);
  await assert.rejects(updateAppliance(f.home.id, parent.id, input("Kitchen", parent.id)), /hierarchy/);
  const foreign = await fixture(t);
  const foreignParent = await createAppliance(foreign.home.id, input("Other house"));
  await assert.rejects(updateAppliance(f.home.id, child.id, input("Fridge", foreignParent.id)), /hierarchy/);
  await assert.rejects(getAppliance(foreign.home.id, child.id), /not found/);
  await assert.rejects(createAppliance(f.home.id, applianceInputSchema.parse({ name: "Gas child", category: "heating", carriers: ["gas"], parentApplianceId: parent.id })), /hierarchy/);
  await assert.rejects(updateAppliance(f.home.id, parent.id, applianceInputSchema.parse({ name: parent.name, category: "other", carriers: ["gas"] })), /hierarchy/);
  await updateAppliance(f.home.id, child.id, input("Fridge", null));
  assert.equal((await getAppliance(f.home.id, child.id)).parentApplianceId, null);
  const results = await Promise.allSettled([
    updateAppliance(f.home.id, child.id, input("Fridge", parent.id)),
    updateAppliance(f.home.id, parent.id, input("Kitchen", child.id)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rows = await db.appliance.findMany({ where: { householdId: f.home.id } });
  assert.equal(energyHierarchyError(rows.map((row) => ({ id: row.id, parentId: row.parentApplianceId }))), null);
  const dependent = rows.find((row) => row.parentApplianceId)!;
  await deleteAppliance(f.home.id, dependent.parentApplianceId!);
  assert.equal((await getAppliance(f.home.id, dependent.id)).parentApplianceId, null);
});

it("carrier-specific measured trees count parent/sub-meters once, prefer sources and preserve missing versus zero readings", options, async (t) => {
  const f = await fixture(t);
  const parent = await createAppliance(f.home.id, input("Kitchen"));
  const child = await createAppliance(f.home.id, input("Fridge", parent.id));
  const missing = await createAppliance(f.home.id, input("Unmeasured child", parent.id));
  const zero = await createAppliance(f.home.id, input("Measured zero"));
  const boiler = await createAppliance(f.home.id, applianceInputSchema.parse({ name: "Boiler", category: "heating", carriers: ["gas"] }));
  const interval = async (carrier: "ELECTRICITY" | "GAS", kind: "GRID_IMPORT" | "APPLIANCE", energyWh: number, applianceId?: string, source: "MANUAL" | "HOME_ASSISTANT" = "MANUAL") => db.energyMeter.create({ data: {
    householdId: f.home.id, name: `${kind}-${applianceId ?? "grid"}-${source}`, carrier, kind, source, applianceId,
    intervals: { create: { startAt: zonedMidnight("2026-10-01"), endAt: zonedMidnight("2026-10-02"), energyWh, status: "MEASURED" } },
  } });
  await interval("ELECTRICITY", "GRID_IMPORT", 1000);
  await interval("ELECTRICITY", "GRID_IMPORT", 1200, undefined, "HOME_ASSISTANT");
  await interval("ELECTRICITY", "APPLIANCE", 500, parent.id);
  await interval("ELECTRICITY", "APPLIANCE", 200, child.id);
  await interval("ELECTRICITY", "APPLIANCE", 0, zero.id);
  await interval("GAS", "GRID_IMPORT", 300);
  await interval("GAS", "APPLIANCE", 200, boiler.id);
  const summary = await getEnergySummary(f.home.id, "day", "2026-10-01");
  const stored = await db.$queryRaw<{ epoch: number }[]>`SELECT EXTRACT(EPOCH FROM i."startAt")::float8 AS epoch FROM energy_intervals i JOIN energy_meters m ON m.id=i."meterId" WHERE m."householdId"=${f.home.id} LIMIT 1`;
  assert.equal(stored[0]!.epoch, zonedMidnight("2026-10-01").getTime() / 1000, "The physical database instant matches the supplied UTC instant, regardless of the database's default timezone");
  assert.equal(summary.totals.consumptionWh, 1200);
  assert.equal(summary.breakdown.unknownWh, 700);
  const readings = summary.breakdown.distribution!;
  assert.equal(readings.find((row) => row.id === missing.id)!.energyWh, null);
  assert.equal(readings.find((row) => row.id === zero.id)!.energyWh, 0);
  const tree = energyDistribution(summary.breakdown.totalWh, readings);
  assert.equal(tree.accountedWh, 500);
  assert.equal(tree.branches.find((row) => row.id === parent.id)!.otherWh, 300);
  assert.deepEqual(summary.status.channels!.find((channel) => channel.carrier === "electricity" && channel.kind === "grid_import")!.sources, ["home_assistant"]);
  const total = await getEnergySummary(f.home.id, "day", "2026-10-01", "total");
  assert.equal(total.totals.consumptionWh, 1500);
  assert.equal(total.breakdown.unknownWh, 800);
  assert.equal(total.breakdown.distributions!.length, 2);
  const reply = await call(f.user, "energy_summary", { period: "day", date: "2026-10-01", carrier: "electricity" });
  assert.equal(reply.isError, false, reply.content[0]?.text);
  const mcp = JSON.parse(reply.content[0]!.text);
  assert.equal(mcp.meterBranches[0].accountedWh, tree.accountedWh);
  assert.equal(mcp.meterBranches[0].otherWh, tree.otherWh);
  assert.equal(await f.quantity(), 0);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
});

it("a one-sided battery reading and a missing import channel keep consumption unknown", options, async (t) => {
  const f = await fixture(t);
  await db.homeBattery.create({ data: { householdId: f.home.id, name: "Battery", capacityWh: 10000 } });
  for (const [kind, energyWh] of [["GRID_IMPORT", 1000], ["GRID_EXPORT", 0], ["BATTERY_CHARGE", 50]] as const) await db.energyMeter.create({ data: {
    householdId: f.home.id, name: kind, carrier: "ELECTRICITY", kind, source: "MANUAL",
    intervals: { create: { startAt: zonedMidnight("2026-10-01"), endAt: zonedMidnight("2026-10-02"), energyWh, status: "MEASURED" } },
  } });
  const summary = await getEnergySummary(f.home.id, "day", "2026-10-01");
  assert.equal(summary.totals.consumptionWh, null);
  assert.equal(summary.totals.batteryChargeWh, 50);
  assert.equal(summary.totals.batteryDischargeWh, null);
  assert.equal(summary.status.batteryMeasured, false);
  assert.equal(summary.breakdown.unknownWh, null);
});

it("MCP hierarchy writes use the owner service, preserve omitted parents and reject child/read-token/foreign writes", options, async (t) => {
  const f = await fixture(t);
  const parent = await createAppliance(f.home.id, input("Circuit"));
  const child = await createAppliance(f.home.id, input("Fridge"));
  const args = { appliance: child.id, parent: parent.id, confirm: true };
  assert.equal((await call(f.user, "energy_save_appliance", args)).isError, false);
  assert.equal((await getAppliance(f.home.id, child.id)).parentApplianceId, parent.id);
  assert.equal((await call(f.user, "energy_save_appliance", { appliance: child.id, name: "Updated name", confirm: true })).isError, false);
  assert.equal((await getAppliance(f.home.id, child.id)).parentApplianceId, parent.id);
  assert.equal((await call({ ...f.user, role: "child" }, "energy_save_appliance", { ...args, parent: null })).isError, true);
  assert.equal((await call(f.user, "energy_save_appliance", { ...args, parent: null }, "read")).isError, true);
  const foreign = await fixture(t);
  const other = await createAppliance(foreign.home.id, input("Foreign"));
  assert.equal((await call(f.user, "energy_save_appliance", { ...args, parent: other.id })).isError, true);
  assert.equal((await getAppliance(f.home.id, child.id)).parentApplianceId, parent.id);
  assert.equal((await call(f.user, "energy_save_appliance", { ...args, parent: null })).isError, false);
  assert.equal((await getAppliance(f.home.id, child.id)).parentApplianceId, null);
});

it("spring and autumn household days retain every measured Wh and the repeated hour is grouped once", options, async (t) => {
  const f = await fixture(t);
  const meter = await db.energyMeter.create({ data: { householdId: f.home.id, name: "Grid", carrier: "ELECTRICITY", kind: "GRID_IMPORT", source: "MANUAL" } });
  for (const [date, next, hours] of [["2026-03-29", "2026-03-30", 23], ["2026-10-25", "2026-10-26", 25]] as const) {
    await db.energyInterval.create({ data: { meterId: meter.id, startAt: zonedMidnight(date), endAt: zonedMidnight(next), energyWh: hours * 100, status: "MEASURED" } });
    const summary = await getEnergySummary(f.home.id, "day", date);
    assert.equal(summary.totals.consumptionWh, hours * 100);
    assert.equal(summary.series.reduce((sum, point) => sum + point.importWh, 0), hours * 100);
    assert.equal(summary.series.find((point) => point.label.endsWith("T02:00"))!.consumptionWh, hours === 23 ? null : 200);
  }
});

it("unrecorded hourly buckets stay unknown and mismatched solar/grid coverage cannot fabricate consumption", options, async (t) => {
  const f = await fixture(t);
  for (const [kind, startAt, energyWh] of [["GRID_IMPORT", "2026-10-01T00:00:00Z", 100], ["SOLAR_PRODUCTION", "2026-10-01T01:00:00Z", 100], ["GRID_EXPORT", "2026-10-01T00:00:00Z", 0]] as const) {
    await db.energyMeter.create({ data: { householdId: f.home.id, name: kind, kind, carrier: "ELECTRICITY", source: "MANUAL", intervals: { create: { startAt: new Date(startAt), endAt: new Date(Date.parse(startAt) + 3600000), energyWh, status: "MEASURED" } } } });
  }
  const summary = await getEnergySummary(f.home.id, "day", "2026-10-01");
  assert.equal(summary.totals.consumptionWh, null);
  assert.equal(summary.series.find((point) => point.label.endsWith("T10:00"))!.consumptionWh, null);
  assert.equal(summary.status.channels!.find((channel) => channel.kind === "grid_import")!.buckets, 1);
});

it("meter workspace retains complete paged reading history beyond the import preview, reports actual equipment links and matches scoped MCP reads", options, async (t) => {
  const { getEnergyMeterDetail, getEnergyData } = await import("@/api/energy/energy.service");
  const f = await fixture(t);
  const foreign = await fixture(t);
  const appliance = await createAppliance(f.home.id, input("Measured circuit"));
  const meter = await db.energyMeter.create({ data: { householdId: f.home.id, name: "Manual circuit channel", carrier: "ELECTRICITY", kind: "APPLIANCE", source: "MANUAL", applianceId: appliance.id,
    readings: { create: Array.from({ length: 31 }, (_, i) => ({ readAt: new Date(Date.UTC(2020, 0, i + 1)), valueWh: i * 1000 })) },
    intervals: { create: { startAt: new Date("2020-01-01T00:00:00Z"), endAt: new Date("2020-01-02T00:00:00Z"), energyWh: 1000, status: "MEASURED" } },
  } });
  assert.equal((await getEnergyData(f.home.id)).readings.length, 20);
  const first = await getEnergyMeterDetail(f.home.id, meter.id);
  const second = await getEnergyMeterDetail(f.home.id, meter.id, 2);
  assert.equal(first.readings.total, 31);
  assert.equal(first.readings.items.length, 25);
  assert.equal(second.readings.items.length, 6);
  assert.equal(new Set([...first.readings.items, ...second.readings.items].map((row) => row.id)).size, 31);
  assert.equal((await getEnergyMeterDetail(f.home.id, meter.id, 999)).readings.page, 2);
  assert.deepEqual(first.appliance, { id: appliance.id, name: appliance.name });
  assert.equal(first.meter.intervalCount, 1);
  assert.equal(first.meter.firstAt, "2020-01-01T00:00:00.000Z");
  assert.equal((await call(f.user, "energy_meter", { id: meter.id, page: 2 }, "read")).isError, false);
  assert.equal((await call({ ...f.user, role: "child" }, "energy_meter", { id: meter.id }, "read")).isError, false);
  assert.equal((await call(foreign.user, "energy_meter", { id: meter.id }, "read")).isError, true);
  await assert.rejects(getEnergyMeterDetail(foreign.home.id, meter.id), /not found/i);
  assert.equal(await db.energyMeterReading.count({ where: { meterId: meter.id } }), 31);
  assert.equal(await f.quantity(), 0);
});
