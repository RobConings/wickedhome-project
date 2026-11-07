export type ShoppingRestockState = "ACTIVE" | "DISMISSED" | "RESTOCKED";

/** A real increase followed by a real decrease rearms automatic groceries; reads and no-ops do not. */
export function nextShoppingRestockState(state: ShoppingRestockState, appliedDelta: number): ShoppingRestockState {
  if (state === "DISMISSED" && appliedDelta > 0) return "RESTOCKED";
  if (state === "RESTOCKED" && appliedDelta < 0) return "ACTIVE";
  return state;
}
