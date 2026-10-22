import type { Habitant, HabitantInput, HabitantType, HouseholdOverview } from "@/features/household/types/household";
import { db, type Habitant as HabitantRow, type HabitantType as HabitantTypeRow } from "../lib/db";
import { conflict, notFound } from "../lib/http";

const toType = (type: HabitantTypeRow) => type.toLowerCase() as HabitantType;
const fromType = (type: HabitantType) => type.toUpperCase() as HabitantTypeRow;

function toHabitant(row: HabitantRow & { user: { id: string } | null }): Habitant {
  return {
    id: row.id,
    name: row.name,
    type: toType(row.type),
    color: row.color,
    emoji: row.emoji,
    birthday: row.birthday?.toISOString().slice(0, 10) ?? null,
    hasAccount: row.user !== null,
  };
}

const toData = (input: HabitantInput) => ({
  name: input.name,
  type: fromType(input.type),
  color: input.color.toLowerCase(),
  emoji: input.emoji || null,
  birthday: input.birthday ? new Date(`${input.birthday}T00:00:00Z`) : null,
});

const withUser = { user: { select: { id: true } } } as const;

export async function getHouseholdOverview(householdId: string): Promise<HouseholdOverview> {
  const household = await db.household.findUniqueOrThrow({
    where: { id: householdId },
    include: { habitants: { include: withUser, orderBy: [{ type: "asc" }, { name: "asc" }] } },
  });
  return {
    household: { id: household.id, name: household.name },
    habitants: household.habitants.map(toHabitant),
  };
}

export async function createHabitant(householdId: string, input: HabitantInput): Promise<Habitant> {
  const row = await db.habitant.create({ data: { householdId, ...toData(input) }, include: withUser });
  return toHabitant(row);
}

/** Loads a habitant, scoped to the household so ids from other households 404. */
async function findOwnHabitant(householdId: string, id: string) {
  const row = await db.habitant.findFirst({ where: { id, householdId }, include: withUser });
  if (!row) throw notFound("Habitant not found");
  return row;
}

export async function updateHabitant(householdId: string, id: string, input: HabitantInput): Promise<Habitant> {
  await findOwnHabitant(householdId, id);
  const row = await db.habitant.update({ where: { id }, data: toData(input), include: withUser });
  return toHabitant(row);
}

export async function deleteHabitant(householdId: string, id: string): Promise<void> {
  const row = await findOwnHabitant(householdId, id);
  if (row.user) throw conflict("This habitant has a login and cannot be removed");
  await db.habitant.delete({ where: { id } });
}
