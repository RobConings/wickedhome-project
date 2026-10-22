import type { Product } from "@/features/shopping";
import type { RecipeIngredient } from "../types/recipes";

/** One row while editing; `key` keeps React rows stable, `id` keeps an existing ingredient (and its cooking taps). */
export type IngredientDraft = {
  key: string;
  id: string | null;
  productId: string | null;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  optional: boolean;
};

let nextKey = 0;
const newKey = () => `row-${(nextKey += 1)}`;

export const emptyIngredient = (): IngredientDraft => ({
  key: newKey(),
  id: null,
  productId: null,
  name: "",
  quantity: "",
  unit: "",
  note: "",
  optional: false,
});

/** The recipe's ingredients as editor rows. */
export const toDrafts = (ingredients: readonly RecipeIngredient[]): IngredientDraft[] =>
  ingredients.map((ingredient) => ({
    key: newKey(),
    id: ingredient.id,
    productId: ingredient.productId,
    name: ingredient.name,
    quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
    unit: ingredient.unit ?? "",
    note: ingredient.note ?? "",
    optional: ingredient.optional,
  }));

/** What the form posts (as JSON): filled rows only, a linked product's name when no name was typed. */
export function draftsToInput(drafts: readonly IngredientDraft[], products: readonly Product[]) {
  return drafts
    .filter((draft) => draft.productId || draft.name.trim())
    .map((draft) => ({
      ...(draft.id && { id: draft.id }),
      productId: draft.productId,
      name: draft.name.trim() || products.find((product) => product.id === draft.productId)?.name || "",
      quantity: draft.quantity.trim() ? Number(draft.quantity.replace(",", ".")) : null,
      unit: draft.unit.trim() || null,
      note: draft.note.trim() || null,
      optional: draft.optional,
    }));
}
