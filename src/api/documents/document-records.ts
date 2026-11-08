import type { DocumentEntityType, DocumentOwnerLink } from "@/features/documents/types/documents";
import { db } from "../lib/db";

/** Resolve only recorded links to records still owned by this household. No name matching or inferred links. */
export async function documentOwnerLink(householdId: string, entityType: DocumentEntityType, entityId: string): Promise<DocumentOwnerLink | null> {
  const where = { householdId, id: entityId };
  const ref = (row: { id: string; name: string } | null, url: (id: string) => string): DocumentOwnerLink | null => row && ({ entityType, entityId, name: row.name, href: url(encodeURIComponent(row.id)) });
  switch (entityType) {
    case "product": return ref(await db.product.findFirst({ where, select: { id: true, name: true } }), (id) => `/inventory/products/${id}`);
    case "task": {
      const row = await db.task.findFirst({ where, select: { id: true, title: true } });
      return ref(row && { id: row.id, name: row.title }, (id) => `/tasks/${id}`);
    }
    case "place": return ref(await db.place.findFirst({ where, select: { id: true, name: true } }), (id) => `/places/${id}`);
    case "device": return ref(await db.device.findFirst({ where, select: { id: true, name: true } }), (id) => `/devices/${id}`);
    case "appliance": return ref(await db.appliance.findFirst({ where, select: { id: true, name: true } }), (id) => `/energy/appliances/${id}`);
    case "habitant": return ref(await db.habitant.findFirst({ where, select: { id: true, name: true } }), (id) => `/habitants/${id}`);
    case "project": return ref(await db.project.findFirst({ where, select: { id: true, name: true } }), (id) => `/projects/${id}`);
    case "recipe": return ref(await db.recipe.findFirst({ where, select: { id: true, name: true } }), (id) => `/recipes/${id}`);
    case "floor": return ref(await db.floor.findFirst({ where, select: { id: true, name: true } }), (id) => `/places/floors/${id}/plan`);
    case "calendar_event": {
      const row = await db.calendarEvent.findFirst({ where, select: { id: true, title: true } });
      return ref(row && { id: row.id, name: row.title }, (id) => `/calendar/events/${id}`);
    }
    case "bill": {
      const row = await db.expense.findFirst({ where, select: { id: true, payee: true } });
      return ref(row && { id: row.id, name: row.payee }, (id) => `/expenses/${id}`);
    }
    case "subscription": {
      const row = await db.recurringExpense.findFirst({ where: { householdId, OR: [{ id: entityId }, { legacySubscriptionId: entityId }] }, select: { id: true, payee: true } });
      return ref(row && { id: row.id, name: row.payee }, (id) => `/expenses/recurring/${id}`);
    }
    case "shopping_list": return ref(await db.shoppingList.findFirst({ where, select: { id: true, name: true } }), (id) => `/shopping?list=${id}`);
    case "shopping_item": {
      const row = await db.shoppingItem.findFirst({ where, select: { id: true, name: true, listId: true } });
      return ref(row, (id) => `/shopping/items/${id}`);
    }
    case "solar_installation": return ref(await db.solarInstallation.findFirst({ where, select: { id: true, name: true } }), (id) => `/energy/solar/${id}`);
    case "home_battery": return ref(await db.homeBattery.findFirst({ where, select: { id: true, name: true } }), (id) => `/energy/batteries/${id}`);
    case "energy_meter": {
      const row = await db.energyMeter.findFirst({ where, select: { id: true, name: true, applianceId: true } });
      return ref(row, (id) => `/energy/meters/${id}`);
    }
  }
}
