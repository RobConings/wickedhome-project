import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { EntityMultiPicker } from "@/components/shared/entity-multi-picker";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { ShopLogo } from "./shop-logo";
import { shopGroupFormSchema, type SavedShopGroup, type Shop } from "../types/shops";

export function ShopGroupFormDialog({ shops, group, trigger }: { shops: Shop[]; group?: SavedShopGroup; trigger: ReactElement }) {
  const { t } = useTranslation("shops");
  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name") },
    { name: "shopIds", type: "custom", label: t("groups.shops"), render: ({ id, name, value, setValue, disabled, invalid }) => <EntityMultiPicker
      id={id} name={name} value={typeof value === "string" ? value.split(",").filter(Boolean) : []}
      onChange={(ids) => setValue(ids.join(","))} disabled={disabled} invalid={invalid}
      items={shops.map((shop) => ({ id: shop.id, label: shop.name, leading: <ShopLogo shop={shop} size="sm" /> }))} /> },
  ];
  return <GeneralFormDialog trigger={trigger} title={t(group ? "groups.edit" : "groups.add")} description={t("groups.description")}
    schema={shopGroupFormSchema} fields={fields} intent={group ? "update-group" : "create-group"}
    hiddenFields={{ id: group?.id }} defaultValues={{ name: group?.name ?? "", shopIds: group?.shopIds.join(",") ?? "" }}
    secondaryAction={group ? { label: t("groups.delete"), destructive: true, intent: "delete-group", data: { id: group.id }, confirm: { title: t("groups.delete"), description: t("groups.deleteHint") } } : undefined} />;
}
