import { compatibleProductType } from "@/features/shopping/types/product-identity";
import type { ResolvedEntity } from "@ai/core/resolve";
import { scoreCandidates } from "@ai/core/resolve";
import { fold } from "@ai/core/text-match";
import { badRequest } from "@/api/lib/http";
import { ingredientName, productCandidates, type MatchProduct } from "./match";

type Linkable = { name: string; product?: ResolvedEntity; unlinkedReason?: string };

/** Save-time protection: exact unique matches are automatic; plausible alternatives need a choice.
 * Ingredient amounts, units, preparation notes and optional flags are left untouched.
 */
export function linkRecipeIngredients<T extends Linkable>(
  ingredients: readonly T[], products: readonly MatchProduct[], existing: ReadonlyMap<string, ResolvedEntity> = new Map(),
): T[] {
  const candidates = productCandidates(products);
  return ingredients.map((item) => {
    if (item.product) return item;
    const previous = existing.get(fold(item.name));
    if (previous) return { ...item, product: previous };
    if (item.unlinkedReason) return item;
    const name = ingredientName(item.name);
    const key = fold(name);
    const exact = candidates.filter((candidate) => [candidate.name, ...(candidate.aliases ?? [])].some((name) => fold(name) === key));
    if (exact.length === 1) return { ...item, product: { type: "product" as const, id: exact[0]!.id, name: exact[0]!.name } };
    const plausible = exact.length ? exact : scoreCandidates(name, candidates.filter((candidate) => [candidate.name, ...(candidate.aliases ?? [])].every((value) => compatibleProductType(name, value)))).slice(0, 5).map((entry) => entry.candidate);
    if (plausible.length) {
      throw badRequest(`Choose an existing product for ingredient "${item.name}": ${plausible.map((product) => `${product.name} [id: ${product.id}]`).join("; ")}. Check recipes_match or inventory_products, ask about important differences, then pass ingredient.product. Do not create a duplicate or save it unlinked to bypass this choice. For a deliberate exception, supply unlinkedReason.`);
    }
    return item;
  });
}
