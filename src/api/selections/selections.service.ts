import {
  MAX_RECENT_SELECTIONS,
  type SelectionEntityType,
  type SelectionRef,
  type Selections,
} from "@/types/selections";
import { db } from "../lib/db";

export async function getSelections(userId: string, entityType: SelectionEntityType): Promise<Selections> {
  const [favorites, recents] = await Promise.all([
    db.favorite.findMany({ where: { userId, entityType }, orderBy: { createdAt: "asc" }, select: { entityId: true } }),
    db.recentSelection.findMany({
      where: { userId, entityType },
      orderBy: { lastUsedAt: "desc" },
      take: MAX_RECENT_SELECTIONS,
    }),
  ]);
  return {
    entityType,
    favoriteIds: favorites.map((favorite) => favorite.entityId),
    recents: recents.map((recent) => ({
      entityId: recent.entityId,
      useCount: recent.useCount,
      lastUsedAt: recent.lastUsedAt.toISOString(),
    })),
  };
}

/** Idempotent: adding an existing favourite is a no-op. */
export async function addFavorite(userId: string, { entityType, entityId }: SelectionRef): Promise<void> {
  await db.favorite.upsert({
    where: { userId_entityType_entityId: { userId, entityType, entityId } },
    create: { userId, entityType, entityId },
    update: {},
  });
}

export async function removeFavorite(userId: string, { entityType, entityId }: SelectionRef): Promise<void> {
  await db.favorite.deleteMany({ where: { userId, entityType, entityId } });
}

/** Records that the user picked an item: bumps it to the top of their recents and trims the oldest. */
export async function recordUse(userId: string, { entityType, entityId }: SelectionRef): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.recentSelection.upsert({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      create: { userId, entityType, entityId },
      update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    const stale = await tx.recentSelection.findMany({
      where: { userId, entityType },
      orderBy: { lastUsedAt: "desc" },
      skip: MAX_RECENT_SELECTIONS,
      select: { id: true },
    });
    if (stale.length > 0) await tx.recentSelection.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  });
}

/** Removes an item from everyone's favourites and recents. Call it when the item itself is deleted. */
export async function forgetEntity(entityType: SelectionEntityType, entityId: string): Promise<void> {
  await db.$transaction([
    db.favorite.deleteMany({ where: { entityType, entityId } }),
    db.recentSelection.deleteMany({ where: { entityType, entityId } }),
  ]);
}
