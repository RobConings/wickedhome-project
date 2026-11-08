import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { GeneralFormField } from "@/components/shared/general-form";
import { ProductPicker } from "./product-picker";
import { sessionAdjustFormSchema } from "../data/sessions-actions";
import type { Product } from "../types/shopping";
import type { SessionItem } from "../types/sessions";

/** Small editor over the checklist: planned quantity and already-linked variants only. */
export function SessionItemAdjustDialog({ item, products, open, onOpenChange, initialSelections }: {
  item: SessionItem; products: Product[]; open: boolean; onOpenChange: (open: boolean) => void;
  /** Seed the existing picker for stories/design fixtures without a network request. */
  initialSelections?: UseSelectionsOptions["initial"];
}) {
  const { t } = useTranslation("shopping");
  const [operationId] = useState(() => crypto.randomUUID());
  const product = products.find((row) => row.id === item.productId);
  const ownerId = product?.stockProductId ?? product?.id;
  const variants = ownerId ? products.filter((row) => (row.stockProductId ?? row.id) === ownerId) : [];
  const fields: GeneralFormField[] = [
    { name: "quantity", type: "number", label: t("sessions.plannedQuantity"), description: item.unit ?? undefined, min: 0.001, max: 100_000, step: 0.001 },
    ...(variants.length > 1 ? [{
      name: "productId", type: "custom", label: t("sessions.variant"),
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker id={id} name={name} products={variants} value={typeof value === "string" ? value : null} onChange={setValue} invalid={invalid} disabled={disabled} initialSelections={initialSelections} />
      ),
    } satisfies GeneralFormField] : []),
  ];
  return <GeneralFormDialog
    open={open} onOpenChange={onOpenChange}
    title={t("sessions.adjustProduct", { name: item.name })}
    description={t("sessions.adjustDescription")}
    intent="adjust-item" schema={sessionAdjustFormSchema} fields={fields}
    hiddenFields={{ itemId: item.id, revision: item.revision, operationId }}
    defaultValues={{ quantity: item.quantity, productId: item.productId ?? undefined }}
    submitLabel={t("sessions.saveQuantity")}
  />;
}
