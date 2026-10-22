import type * as React from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { ShopActionResult } from "../data/shops-loaders";
import { SHOP_TYPES, shopFormSchema, type Shop, type ShopType } from "../types/shops";
import { ShopLogo } from "./shop-logo";
import { ShopTypeIcon } from "./shop-type-icon";

type ShopFormDialogProps = {
  /** Edit this shop; omit to add a new one. */
  shop?: Shop;
  /** Type preselected for a new shop. */
  defaultType?: ShopType;
  trigger: React.ReactElement;
};

export function ShopFormDialog({ shop, defaultType = "supermarket", trigger }: ShopFormDialogProps) {
  const { t } = useTranslation("shops");
  const isEdit = Boolean(shop);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), span: "half" },
    {
      name: "type",
      type: "select",
      label: t("fields.type"),
      span: "half",
      options: SHOP_TYPES.map((option) => ({
        value: option,
        label: t(`types.${option}`),
        icon: <ShopTypeIcon type={option} />,
      })),
    },
    {
      name: "websiteUrl",
      type: "text",
      inputType: "url",
      inputMode: "url",
      label: t("fields.websiteUrl"),
      description: t("icon.auto"),
      placeholder: "https://www.example.be",
    },
    { name: "hasWebshop", type: "switch", label: t("fields.hasWebshop"), description: t("fields.hasWebshopDescription") },
    {
      name: "ingredientSearch",
      type: "switch",
      label: t("ingredientSearch.label"),
      description: t("ingredientSearch.description"),
      // Only a shop with a webshop and a website can be searched; hidden, it posts nothing (= off).
      when: (values) => values.hasWebshop === true && typeof values.websiteUrl === "string" && values.websiteUrl.trim() !== "",
    },
    { name: "address", type: "text", label: t("fields.address") },
    {
      name: "openingHours",
      type: "textarea",
      rows: 2,
      label: t("fields.openingHours"),
      placeholder: t("fields.openingHoursPlaceholder"),
    },
    { name: "notes", type: "textarea", rows: 3, label: t("fields.notes") },
  ];

  return (
    <GeneralFormDialog<ShopActionResult>
      trigger={trigger}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      media={(values) => (
        <ShopLogo shop={{ type: (values.type as ShopType) || defaultType, iconUrl: shop?.iconUrl }} size="md" />
      )}
      intro={shop?.isBuiltIn && <InlineAlert tone="info">{t("form.builtInNotice")}</InlineAlert>}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      schema={shopFormSchema}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      hiddenFields={{ id: shop?.id }}
      defaultValues={{
        name: shop?.name ?? "",
        type: shop?.type ?? defaultType,
        websiteUrl: shop?.websiteUrl ?? "",
        hasWebshop: shop?.hasWebshop ?? false,
        ingredientSearch: shop?.ingredientSearch ?? false,
        address: shop?.address ?? "",
        openingHours: shop?.openingHours ?? "",
        notes: shop?.notes ?? "",
      }}
    />
  );
}
