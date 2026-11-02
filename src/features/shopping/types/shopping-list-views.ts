import type { ShoppingList } from "./shopping";

export type ShoppingListView = {
  id: string;
  name: string;
  listIds: string[];
  openCount: number;
  /** System groceries combine automatic and manual entries; only custom lists are edited here. */
  editableList: ShoppingList | null;
};

/** Stock level is an independent property, so default grocery lists form one shopping view. */
export function shoppingListViews(lists: ShoppingList[], groceriesName: string): ShoppingListView[] {
  const defaults = lists.filter((list) => list.kind === "groceries" && list.defaultSource !== null && list.defaultSource !== "task");
  const defaultIds = new Set(defaults.map((list) => list.id));
  const main = defaults.find((list) => list.defaultSource === "manual") ?? defaults[0];
  const result: ShoppingListView[] = main ? [{
    id: main.id, name: groceriesName, listIds: defaults.map((list) => list.id),
    openCount: defaults.reduce((count, list) => count + list.openCount, 0), editableList: null,
  }] : [];
  return [...result, ...lists.filter((list) => !defaultIds.has(list.id)).map((list) => ({
    id: list.id, name: list.name, listIds: [list.id], openCount: list.openCount, editableList: list,
  }))];
}
