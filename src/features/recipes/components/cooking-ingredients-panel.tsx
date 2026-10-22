import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Product } from "@/features/shopping";
import type { UseSelectionsOptions } from "@/lib/selections";
import { sortForStep, stepMentions, type CookingIngredient } from "../types/recipes";
import { AddExtraDialog } from "./add-extra-dialog";
import { CookingIngredientRow } from "./cooking-ingredient-row";

type CookingIngredientsPanelProps = {
  entryId: string;
  ingredients: CookingIngredient[];
  extras: CookingIngredient[];
  /** The current step's text: ingredients it mentions come first. */
  stepText?: string | null;
  products: Product[];
  canSaveToRecipe: boolean;
  /** The meal was made: taps and extras are off. */
  disabled?: boolean;
  onUndo: (usageId: string) => void;
  action?: string;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * The ingredients while cooking: the ones the current step mentions first (marked), then the rest, then the
 * extras added while cooking, and "+ Ingredient". Content only: the cooking screen puts it in a side column
 * (wide screens) or a bottom sheet (phones).
 */
export function CookingIngredientsPanel({
  entryId,
  ingredients,
  extras,
  stepText,
  products,
  canSaveToRecipe,
  disabled,
  onUndo,
  action,
  initialSelections,
}: CookingIngredientsPanelProps) {
  const { t } = useTranslation("recipes");
  const row = (item: CookingIngredient) => (
    <li key={`${item.kind}-${item.id}`}>
      <CookingIngredientRow
        item={item}
        entryId={entryId}
        mentioned={Boolean(stepText && stepMentions(stepText, item.name))}
        disabled={disabled}
        onUndo={onUndo}
        action={action}
      />
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      {ingredients.length === 0 && extras.length === 0 && <p className="text-sm text-muted-foreground">{t("cooking.noIngredients")}</p>}
      {ingredients.length > 0 && <ul className="flex flex-col gap-1">{sortForStep(ingredients, stepText).map(row)}</ul>}
      {extras.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="px-2 text-sm font-medium text-muted-foreground">{t("cooking.extras")}</h3>
          <ul className="flex flex-col gap-1">{extras.map(row)}</ul>
        </div>
      )}
      {!disabled && (
        <AddExtraDialog
          entryId={entryId}
          products={products}
          canSaveToRecipe={canSaveToRecipe}
          action={action}
          initialSelections={initialSelections}
          trigger={
            <Button variant="outline" fullOnMobile className="self-start">
              <PlusIcon />
              {t("cooking.addIngredient")}
            </Button>
          }
        />
      )}
    </div>
  );
}
