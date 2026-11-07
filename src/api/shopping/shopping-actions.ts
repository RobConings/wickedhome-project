import type { SessionUser } from "@/features/auth/types/auth";
import type { ShoppingItemUpdateInput } from "@/features/shopping/types/shopping";
import {
  findRestockTarget,
  restockFromShoppingItem,
} from "../inventory/inventory.service";
import { updateItem } from "./shopping.service";

/** Web and MCP use the same purchase orchestration and stable shopping source identity. */
export async function updateShoppingItem(
  user: SessionUser,
  id: string,
  input: ShoppingItemUpdateInput,
) {
  const { item, justBought } = await updateItem(user, id, input);
  const restock =
    input.status === "bought"
      ? await findRestockTarget(user.householdId, item)
      : null;
  const stock = restock
    ? await restockFromShoppingItem(user, item.id, {
        ...restock,
        purchaseDecision: input.purchaseDecision,
      })
    : null;
  return { item, justBought, restock, stock: stock?.purchase ?? null };
}
