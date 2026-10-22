import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { useProductSelections } from "../data/use-product-selections";
import type { Product } from "../types/shopping";
import { ProductPicker } from "./product-picker";

type LinkAlternativeDialogProps = {
  product: Product;
  /** The catalogue to choose from; products already sharing `product`'s stock are left out. */
  products: Product[];
  /**
   * `add`: the chosen product becomes an alternative of `product` (its product page). `of`: `product`
   * becomes an alternative of the chosen one (e.g. a product that was just scanned and added).
   */
  mode?: "add" | "of";
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** After linking, with the product that was linked (`product` in mode `of`, the chosen one in mode `add`). */
  onLinked?: (productId: string) => void;
  /** Route to post to; defaults to the current route (its action handles `handleProductAlternativeForm`). */
  action?: string;
  initialSelections?: UseSelectionsOptions["initial"];
};

const idOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/**
 * Link two products so they share one stock (alternatives): pick the other product, optionally name the
 * shared stock (a new generic product such as "Bacon"). Posts `link-alternative`.
 */
export function LinkAlternativeDialog({
  product,
  products,
  mode = "add",
  trigger,
  open,
  onOpenChange,
  onLinked,
  action,
  initialSelections,
}: LinkAlternativeDialogProps) {
  const { t } = useTranslation("shopping");
  const { recordUse } = useProductSelections();
  const chosen = React.useRef<string | null>(null);
  const owner = product.stockProductId ?? product.id;
  const candidates = React.useMemo(() => products.filter((other) => (other.stockProductId ?? other.id) !== owner), [products, owner]);
  // In mode `add` the chosen product is the one that is linked (posted as `id`); in mode `of` it is the main one.
  const pickerName = mode === "add" ? "id" : "mainProductId";

  const fields: GeneralFormField[] = [
    {
      name: pickerName,
      type: "custom",
      label: t("alternatives.product"),
      errorNames: ["mainProductId", "id"],
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={candidates}
          value={idOrNull(value)}
          onChange={(next) => {
            chosen.current = next;
            setValue(next);
          }}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections}
        />
      ),
    },
    {
      name: "newMainName",
      type: "text",
      label: t("alternatives.sharedName"),
      description: t("alternatives.sharedNameDescription"),
      optional: true,
      maxLength: 120,
    },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (next) chosen.current = null;
        onOpenChange?.(next);
      }}
      title={mode === "add" ? t("alternatives.linkTitle", { name: product.name }) : t("alternatives.linkOfTitle", { name: product.name })}
      description={t("alternatives.linkDescription")}
      successMessage={t("alternatives.linked")}
      submitLabel={t("alternatives.submit")}
      fields={fields}
      intent="link-alternative"
      action={action}
      hiddenFields={mode === "add" ? { mainProductId: product.id } : { id: product.id }}
      defaultValues={{ [pickerName]: null, newMainName: "" }}
      onSuccess={() => {
        if (chosen.current) void recordUse(chosen.current);
        onLinked?.(mode === "add" ? (chosen.current ?? product.id) : product.id);
      }}
    />
  );
}
