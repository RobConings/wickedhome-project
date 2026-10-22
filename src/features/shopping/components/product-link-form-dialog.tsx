import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { ShopPicker, type Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { productShopLinkInputSchema, type Product, type ProductShopLink } from "../types/shopping";

type ProductLinkFormDialogProps = {
  product: Product;
  /** Edit this link; omit to add a shop. */
  link?: ProductShopLink;
  shops: Shop[];
  trigger: React.ReactElement;
  initialSelections?: UseSelectionsOptions["initial"];
};

/** Where a product can be bought: shop, webshop link, price and article number (`upsert-link`). */
export function ProductLinkFormDialog({ product, link, shops, trigger, initialSelections }: ProductLinkFormDialogProps) {
  const { t } = useTranslation("shopping");

  const fields: GeneralFormField[] = [
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      // The shop of an existing link is fixed (it is the link's key); it is posted as a hidden field then.
      hidden: Boolean(link),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ShopPicker
          id={id}
          name={name}
          shops={shops}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections}
        />
      ),
    },
    { name: "url", type: "text", inputType: "url", inputMode: "url", label: t("fields.url"), placeholder: "https://" },
    { name: "priceCents", type: "money", label: t("fields.price"), span: "half" },
    { name: "articleNumber", type: "text", label: t("fields.articleNumber"), maxLength: 40, span: "half" },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      trigger={trigger}
      title={t("products.linkTitle", { name: product.name })}
      description={t("products.linkDescription")}
      successMessage={t("products.linkSaved")}
      schema={productShopLinkInputSchema}
      fields={fields}
      intent="upsert-link"
      hiddenFields={{ id: product.id, shopId: link?.shopId }}
      defaultValues={{
        shopId: null,
        url: link?.url ?? "",
        priceCents: link?.priceCents ?? null,
        articleNumber: link?.articleNumber ?? "",
      }}
      contentClassName="sm:max-w-md"
    />
  );
}
