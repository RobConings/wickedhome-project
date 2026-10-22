import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField, GeneralFormValues } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { ShopPicker, type Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import { todayIn } from "@/types/dates";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { stapleInputSchema, type Product, type ShoppingList, type ShoppingStaple } from "../types/shopping";
import { ProductPicker } from "./product-picker";
import { STAPLE_REPEAT_OPTIONS } from "./staple-repeat";

type StapleFormDialogProps = {
  staple?: ShoppingStaple;
  lists: ShoppingList[];
  products: Product[];
  shops: Shop[];
  /** List preselected for a new staple. */
  defaultListId?: string;
  trigger: React.ReactElement;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
};

/** Add or edit a recurring staple. Posts to the route action (`create-staple` / `update-staple`). */
export function StapleFormDialog({ staple, lists, products, shops, defaultListId, trigger, initialSelections }: StapleFormDialogProps) {
  const { t } = useTranslation("shopping");
  const rrule = staple?.rrule ?? "FREQ=WEEKLY";
  const repeatOptions = STAPLE_REPEAT_OPTIONS.some((option) => option.rrule === rrule)
    ? STAPLE_REPEAT_OPTIONS
    : [...STAPLE_REPEAT_OPTIONS, { rrule, key: "custom" as const }];

  /** Choosing a product fills in its name, unit and usual shop; they stay editable. */
  const fillFromProduct = (next: GeneralFormValues, _previous: GeneralFormValues, changed: string): GeneralFormValues => {
    if (changed !== "productId") return next;
    const product = products.find((candidate) => candidate.id === next.productId);
    if (!product) return next;
    return {
      ...next,
      name: product.name,
      ...(product.unit ? { unit: product.unit } : {}),
      ...(product.defaultShopId ? { shopId: product.defaultShopId } : {}),
    };
  };

  const fields: GeneralFormField[] = [
    {
      name: "listId",
      type: "select",
      label: t("fields.list"),
      placeholder: t("picker.list"),
      options: lists.map((list) => ({ value: list.id, label: list.name })),
    },
    {
      name: "productId",
      type: "custom",
      label: t("products.title"),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={products}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          clearable
          initialSelections={initialSelections?.products}
        />
      ),
    },
    { name: "name", type: "text", label: t("fields.name"), maxLength: 120 },
    { name: "quantity", type: "number", label: t("fields.quantity"), min: 0, step: "any", span: "half" },
    { name: "unit", type: "text", label: t("fields.unit"), placeholder: t("fields.unitPlaceholder"), maxLength: 20, span: "half" },
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ShopPicker
          id={id}
          name={name}
          shops={shops}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          clearable
          initialSelections={initialSelections?.shops}
        />
      ),
    },
    {
      name: "rrule",
      type: "select",
      label: t("fields.repeat"),
      span: "half",
      options: repeatOptions.map((option) => ({ value: option.rrule, label: t(`repeat.${option.key}`, { rule: option.rrule }) })),
    },
    { name: "startDate", type: "date", label: t("fields.startDate"), span: "half" },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      trigger={trigger}
      title={staple ? t("staples.editTitle") : t("staples.createTitle")}
      description={t("staples.formDescription")}
      successMessage={staple ? t("staples.updated") : t("staples.created")}
      schema={stapleInputSchema}
      fields={fields}
      adjustValues={fillFromProduct}
      intent={staple ? "update-staple" : "create-staple"}
      hiddenFields={{ id: staple?.id }}
      defaultValues={{
        listId: staple?.listId ?? defaultListId ?? lists[0]?.id ?? "",
        productId: staple?.productId ?? null,
        name: staple?.name ?? "",
        quantity: staple?.quantity ?? 1,
        unit: staple?.unit ?? "",
        shopId: staple?.shopId ?? null,
        rrule,
        startDate: staple?.startDate ?? todayIn(),
      }}
    />
  );
}
