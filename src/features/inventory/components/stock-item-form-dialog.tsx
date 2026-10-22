import type * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { GeneralFormField, GeneralFormValues } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { PlacePicker, type Place } from "@/features/places";
import { ProductPicker, type Product } from "@/features/shopping";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { InventoryActionResult } from "../data/inventory-loaders";
import { stockItemInputSchema, stockItemUpdateFormSchema, type StockItem } from "../types/inventory";

type StockItemFormDialogProps = {
  /** Edit this stock item; omit to start keeping a product at a place. */
  stockItem?: StockItem;
  products: Product[];
  places: Place[];
  /** Preselect for a new stock item (e.g. from a product page or a place). */
  defaults?: { productId?: string; placeId?: string };
  trigger?: React.ReactElement;
  /** Controlled opening (e.g. right after a scanned product was added). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after the stock item saved (not after a delete). */
  onSaved?: () => void;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; places?: UseSelectionsOptions["initial"] };
};

/**
 * Keep a product at a place, with its quantity, minimum and expiry. Posts `create-stock` / `update-stock`
 * to the route action; changing the quantity here is logged as a manual correction. An existing stock item
 * can be deleted from the dialog's footer too (`delete-stock`).
 */
export function StockItemFormDialog({
  stockItem,
  products,
  places,
  defaults,
  trigger,
  open,
  onOpenChange,
  onSaved,
  initialSelections,
}: StockItemFormDialogProps) {
  const { t } = useTranslation("inventory");
  const { t: tCommon } = useTranslation();

  /** A chosen product brings its unit along, unless one was typed already. */
  const fillUnit = (next: GeneralFormValues, previous: GeneralFormValues, changed: string): GeneralFormValues => {
    if (changed !== "productId" || previous.unit) return next;
    const product = products.find((candidate) => candidate.id === next.productId);
    return product?.unit ? { ...next, unit: product.unit } : next;
  };

  const fields: GeneralFormField[] = [
    // Product and place identify the stock item: chosen once, then fixed.
    {
      name: "productId",
      type: "custom",
      label: t("fields.product"),
      hidden: Boolean(stockItem),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={products}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections?.products}
        />
      ),
    },
    {
      name: "placeId",
      type: "custom",
      label: t("fields.place"),
      hidden: Boolean(stockItem),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <PlacePicker
          id={id}
          name={name}
          places={places}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections?.places}
        />
      ),
    },
    { name: "quantity", type: "number", label: t("fields.quantity"), min: 0, step: "any", placeholder: "0", span: "half" },
    { name: "unit", type: "text", label: t("fields.unit"), maxLength: 20, span: "half" },
    {
      name: "minQuantity",
      type: "number",
      label: t("fields.minQuantity"),
      description: t("fields.minQuantityDescription"),
      min: 0,
      step: "any",
      span: "half",
    },
    { name: "expiresOn", type: "date", label: t("fields.expiresOn"), span: "half" },
  ];

  return (
    <GeneralFormDialog<InventoryActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={stockItem ? t("form.editTitle", { name: stockItem.productName, place: stockItem.placeName }) : t("form.createTitle")}
      description={t("form.description")}
      successMessage={stockItem ? t("form.updated") : t("form.created")}
      schema={stockItem ? stockItemUpdateFormSchema : stockItemInputSchema}
      fields={fields}
      adjustValues={fillUnit}
      intent={stockItem ? "update-stock" : "create-stock"}
      hiddenFields={{ id: stockItem?.id }}
      defaultValues={{
        productId: defaults?.productId ?? null,
        placeId: defaults?.placeId ?? null,
        quantity: stockItem?.quantity ?? "",
        unit: stockItem?.unit ?? "",
        minQuantity: stockItem?.minQuantity ?? "",
        expiresOn: stockItem?.expiresOn ?? "",
      }}
      secondaryAction={
        stockItem && {
          label: tCommon("actions.delete"),
          icon: <Trash2Icon />,
          destructive: true,
          intent: "delete-stock",
          data: { id: stockItem.id },
          confirm: {
            title: t("form.deleteTitle", { name: stockItem.productName, place: stockItem.placeName }),
            description: t("form.deleteDescription"),
          },
          successMessage: t("form.deleted"),
        }
      }
      onSuccess={(result) => {
        if (result.addedToShoppingList) toast(t("lowStock.addedToList", { name: stockItem?.productName ?? "" }));
        onSaved?.();
      }}
    />
  );
}
