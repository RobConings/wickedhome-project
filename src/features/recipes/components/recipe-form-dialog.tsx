import type * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import type { Product } from "@/features/shopping";
import type { Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { MAX_RECIPE_INGREDIENTS, joinSteps, recipeFormSchema, type Recipe, type RecipeCategory } from "../types/recipes";
import { emptyIngredient, toDrafts, type IngredientDraft } from "./ingredient-drafts";
import { IngredientsEditor } from "./ingredients-editor";

/** Every per-row name the editor shows errors for itself (so they aren't repeated above the form). */
const INGREDIENT_ERROR_NAMES = Array.from({ length: MAX_RECIPE_INGREDIENTS }, (_, index) => [
  `ingredients.${index}.name`,
  `ingredients.${index}.quantity`,
]).flat();

type RecipeFormDialogProps = {
  categories?: RecipeCategory[];
  /** Edit this recipe; omit to add one. */
  recipe?: Recipe;
  /** The catalogue, for the ingredients' product pickers. */
  products: Product[];
  /** For "+ New product" in the ingredients editor. */
  shops?: Shop[];
  /** Route to post to (default: the current route). */
  action?: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** After it saved (or the recipe was deleted). */
  onSaved?: (result: RecipeActionResult) => void;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Add or edit a recipe: name, servings, where it came from, the ingredients (a product or free text per row)
 * and the steps (one per paragraph or numbered line; "10 min" in a step gives it a timer). Delete from the footer.
 */
export function RecipeFormDialog({
  recipe,
  categories = [],
  products,
  shops,
  action,
  trigger,
  open,
  onOpenChange,
  onSaved,
  initialSelections,
}: RecipeFormDialogProps) {
  const { t, i18n } = useTranslation("recipes");
  const isEdit = Boolean(recipe);
  const translateError = (message: string) => (i18n.exists(`recipes:errors.${message}`) ? t(`errors.${message}`) : message);

  const fields: GeneralFormField[] = [
    {
      name: "name",
      type: "text",
      label: t("fields.name"),
      placeholder: t("fields.namePlaceholder"),
    },
    {
      name: "categoryId",
      type: "select",
      label: t("fields.category"),
      description: t("categories.chooseHint"),
      options: [{ value: "none", label: t("categories.uncategorized") }, ...categories.map((category) => ({ value: category.id, label: category.name }))],
    },
    {
      name: "servings",
      type: "number",
      label: t("fields.servings"),
      description: t("fields.servingsDescription"),
      min: 1,
      max: 100,
      inputMode: "numeric",
      span: "half",
    },
    {
      name: "sourceUrl",
      type: "text",
      inputType: "url",
      inputMode: "url",
      label: t("fields.sourceUrl"),
      placeholder: "https://",
      span: "half",
    },
    {
      name: "ingredients",
      type: "custom",
      label: t("fields.ingredients"),
      description: t("fields.ingredientsDescription"),
      errorNames: INGREDIENT_ERROR_NAMES,
      render: ({ id, name, value, setValue, errorsFor, disabled }) => (
        <IngredientsEditor
          id={id}
          name={name}
          value={(value as IngredientDraft[] | undefined) ?? []}
          onChange={setValue}
          products={products}
          shops={shops}
          errorsFor={errorsFor}
          disabled={disabled}
          initialSelections={initialSelections}
        />
      ),
    },
    {
      name: "steps",
      type: "textarea",
      rows: 8,
      label: t("fields.steps"),
      description: t("fields.stepsDescription"),
      placeholder: t("fields.stepsPlaceholder"),
    },
    { name: "notes", type: "textarea", rows: 3, label: t("fields.notes") },
  ];

  return (
    <GeneralFormDialog<RecipeActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      contentClassName="sm:max-w-2xl"
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      schema={recipeFormSchema}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      action={action}
      hiddenFields={{ id: recipe?.id }}
      translateError={translateError}
      defaultValues={{
        name: recipe?.name ?? "",
        categoryId: recipe?.category?.id ?? "none",
        servings: recipe?.servings ?? "",
        sourceUrl: recipe?.sourceUrl ?? "",
        ingredients: recipe ? toDrafts(recipe.ingredients) : [emptyIngredient()],
        steps: recipe ? joinSteps(recipe.steps) : "",
        notes: recipe?.notes ?? "",
      }}
      onSuccess={onSaved}
      secondaryAction={
        recipe
          ? {
              label: t("delete.label"),
              icon: <Trash2Icon />,
              destructive: true,
              intent: "delete",
              data: { id: recipe.id },
              action,
              confirm: {
                title: t("delete.title", { name: recipe.name }),
                description: t("delete.description"),
              },
              successMessage: t("delete.deleted"),
              onSuccess: onSaved,
            }
          : undefined
      }
    />
  );
}
