import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { SHOPPING_LIST_KINDS, shoppingListInputSchema, type ShoppingList } from "../types/shopping";

type ShoppingListFormDialogProps = {
  /** Edit this list; omit to create one. */
  list?: ShoppingList;
  trigger: React.ReactElement;
};

/** Create or rename a shopping list. Posts to the route action (`create-list` / `update-list`). */
export function ShoppingListFormDialog({ list, trigger }: ShoppingListFormDialogProps) {
  const { t } = useTranslation("shopping");

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), maxLength: 60 },
    {
      name: "kind",
      type: "select",
      label: t("fields.kind"),
      options: SHOPPING_LIST_KINDS.map((kind) => ({ value: kind, label: t(`listKinds.${kind}`) })),
    },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      trigger={trigger}
      title={list ? t("listForm.editTitle") : t("listForm.createTitle")}
      description={t("listForm.description")}
      successMessage={list ? t("listForm.updated") : t("listForm.created")}
      schema={shoppingListInputSchema}
      fields={fields}
      intent={list ? "update-list" : "create-list"}
      hiddenFields={{ id: list?.id }}
      defaultValues={{ name: list?.name ?? "", kind: list?.kind ?? "groceries" }}
      contentClassName="sm:max-w-md"
    />
  );
}
