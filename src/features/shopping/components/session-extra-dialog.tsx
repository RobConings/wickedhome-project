import { Input } from "@/components/ui/input";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { ProductPicker } from "./product-picker";
import { sessionExtraFormSchema } from "../data/sessions-actions";
import type { Product } from "../types/shopping";

export function SessionExtraDialog({ products, disabled }: { products: Product[]; disabled?: boolean }) {
  const { t } = useTranslation("shopping");
  const fields: GeneralFormField[] = [
    { name: "productId", type: "custom", label: t("sessions.product"), optional: true,
      render: ({ id, name, value, setValue, invalid, disabled }) => <ProductPicker id={id} name={name} products={products} value={typeof value === "string" ? value : null} onChange={setValue} invalid={invalid} disabled={disabled} /> },
    { name: "name", type: "text", label: t("fields.name"), description: t("sessions.extraNameHint"), optional: true, when: (values) => !values.productId },
    { name: "quantity", type: "number", label: t("fields.quantity"), min: 0.001, step: 0.001, max: 100_000, span: "half" },
    { name: "unit", type: "custom", label: t("fields.unit"), optional: true, span: "half", description: t("sessions.extraUnitHint"),
      render: ({ id, name, value, values, setValue, disabled }) => <Input id={id} name={name} maxLength={20} value={typeof value === "string" ? value : ""} onChange={(event) => setValue(event.target.value)} disabled={disabled} placeholder={products.find((product) => product.id === values.productId)?.unit ?? t("fields.unitPlaceholder")} /> },
  ];
  return <GeneralFormDialog trigger={<Button variant="outline" disabled={disabled}><PlusIcon />{t("sessions.add")}</Button>}
    title={t("sessions.add")} description={t("sessions.extraDescription")} schema={sessionExtraFormSchema} fields={fields}
    intent="add-extra" defaultValues={{ quantity: 1 }} />;
}
