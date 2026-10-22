import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField, GeneralFormValues } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { ProductPicker, useProductSelections, type Product } from "@/features/shopping";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { mealPlanExtraFormSchema } from "../types/recipes";

type AddExtraDialogProps = {
  entryId: string;
  products: Product[];
  /** Owners and adults may also add it to the recipe. */
  canSaveToRecipe: boolean;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Route to post to (default: the current route). */
  action?: string;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * "+ Ingredient" while cooking: a product (favourites and recents first) or just a name, how much, "used it
 * now" (on: it's taken from stock at once) and "also add to the recipe" (off by default).
 */
export function AddExtraDialog({ entryId, products, canSaveToRecipe, trigger, open, onOpenChange, action, initialSelections }: AddExtraDialogProps) {
  const { t, i18n } = useTranslation("recipes");
  const { recordUse } = useProductSelections({ initial: initialSelections });
  const translateError = (message: string) => (i18n.exists(`recipes:errors.${message}`) ? t(`errors.${message}`) : message);
  // The product chosen last, recorded as "recently used" once it saved.
  const chosenProduct = React.useRef<string | null>(null);

  /** A chosen product brings its unit along, unless one was typed already. */
  const fillUnit = (next: GeneralFormValues, previous: GeneralFormValues, changed: string): GeneralFormValues => {
    if (changed !== "productId" || previous.unit) return next;
    const product = products.find((candidate) => candidate.id === next.productId);
    return product?.unit ? { ...next, unit: product.unit } : next;
  };

  const fields: GeneralFormField[] = [
    {
      name: "productId",
      type: "custom",
      label: t("extra.product"),
      description: t("extra.productDescription"),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={products}
          value={typeof value === "string" ? value : null}
          onChange={(productId) => {
            chosenProduct.current = productId;
            setValue(productId);
          }}
          invalid={invalid}
          disabled={disabled}
          clearable
          initialSelections={initialSelections}
        />
      ),
    },
    {
      name: "name",
      type: "text",
      label: t("extra.name"),
      placeholder: t("extra.namePlaceholder"),
      when: (values) => !values.productId,
    },
    {
      name: "quantity",
      type: "number",
      label: t("extra.quantity"),
      min: 0,
      step: "any",
      inputMode: "decimal",
      placeholder: "1",
      span: "half",
    },
    {
      name: "unit",
      type: "text",
      label: t("extra.unit"),
      maxLength: 20,
      span: "half",
    },
    {
      name: "use",
      type: "switch",
      label: t("extra.use"),
      description: t("extra.useDescription"),
    },
    {
      name: "saveToRecipe",
      type: "switch",
      label: t("extra.saveToRecipe"),
      hidden: !canSaveToRecipe,
    },
  ];

  return (
    <GeneralFormDialog<RecipeActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("extra.title")}
      description={t("extra.description")}
      successMessage={t("extra.added")}
      schema={mealPlanExtraFormSchema}
      fields={fields}
      adjustValues={fillUnit}
      intent="extra"
      action={action}
      hiddenFields={{ entryId }}
      translateError={translateError}
      defaultValues={{
        productId: null,
        name: "",
        quantity: "",
        unit: "",
        use: true,
        saveToRecipe: false,
      }}
      onSuccess={() => {
        if (chosenProduct.current) void recordUse(chosenProduct.current).catch(() => undefined);
      }}
    />
  );
}
