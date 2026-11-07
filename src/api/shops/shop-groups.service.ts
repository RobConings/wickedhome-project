import { shopGroupInputSchema, type SavedShopGroup, type ShopGroupInput } from "@/features/shops/types/shops";
import { db, type Prisma } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";

const include = { members: { select: { shopId: true }, orderBy: { shopId: "asc" as const } } };
type GroupRow = Prisma.ShopGroupGetPayload<{ include: typeof include }>;
const toGroup = (row: GroupRow): SavedShopGroup => ({ id: row.id, name: row.name, shopIds: row.members.map((member) => member.shopId) });

export async function listShopGroups(householdId: string): Promise<SavedShopGroup[]> {
  return (await db.shopGroup.findMany({ where: { householdId }, include, orderBy: { name: "asc" } })).map(toGroup);
}

export async function saveShopGroup(householdId: string, input: ShopGroupInput, id?: string): Promise<SavedShopGroup> {
  const parsed = shopGroupInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Name the group and choose at least two different shops");
  input = parsed.data;
  try {
    return await db.$transaction(async (tx) => {
      if (id && !await tx.shopGroup.findFirst({ where: { id, householdId }, select: { id: true } })) throw notFound("Shop group not found");
      const visible = await tx.shop.count({ where: { id: { in: input.shopIds }, OR: [{ householdId }, { householdId: null }] } });
      if (visible !== input.shopIds.length) throw badRequest("Choose shops available to this household");
      const members = { create: input.shopIds.map((shopId) => ({ shopId })) };
      const row = id
        ? await tx.shopGroup.update({ where: { id, householdId }, data: { name: input.name, members: { deleteMany: {}, ...members } }, include })
        : await tx.shopGroup.create({ data: { householdId, name: input.name, members }, include });
      return toGroup(row);
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw conflict("A shop group with this name already exists");
    throw error;
  }
}

export async function deleteShopGroup(householdId: string, id: string): Promise<void> {
  const removed = await db.shopGroup.deleteMany({ where: { id, householdId } });
  if (!removed.count) throw notFound("Shop group not found");
}
