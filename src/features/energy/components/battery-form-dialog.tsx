import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { formatNumber } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { EnergyActionResult } from "../data/energy-loaders";
import { batteryFormSchema, type HomeBattery } from "../types/energy";

type BatteryFormDialogProps = {
  /** Edit this battery; omit to add one. */
  battery?: HomeBattery;
  trigger: React.ReactElement;
};

export function BatteryFormDialog({ battery, trigger }: BatteryFormDialogProps) {
  const { t } = useTranslation("energy");
  const isEdit = Boolean(battery);
  // The form speaks kWh and kW with a decimal comma; the API stores Wh and W.
  const decimal = (value: number | null | undefined) =>
    value == null ? "" : formatNumber(value / 1000, currentLocale(), { useGrouping: false, maximumFractionDigits: 2 });

  // Decimal fields are text inputs: "13,5" with a comma must stay as typed (a number input would drop it).
  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("battery.fields.name"), placeholder: t("battery.form.namePlaceholder") },
    { name: "capacityKwh", type: "text", inputMode: "decimal", label: t("battery.fields.capacityKwh") },
    { name: "maxChargeKw", type: "text", inputMode: "decimal", label: t("battery.fields.maxChargeKw"), span: "half", optional: true },
    { name: "maxDischargeKw", type: "text", inputMode: "decimal", label: t("battery.fields.maxDischargeKw"), span: "half", optional: true },
    { name: "installedOn", type: "date", label: t("battery.fields.installedOn"), optional: true },
  ];

  return (
    <GeneralFormDialog<EnergyActionResult>
      trigger={trigger}
      title={isEdit ? t("battery.form.editTitle") : t("battery.form.createTitle")}
      description={t("battery.form.description")}
      successMessage={isEdit ? t("battery.form.updated") : t("battery.form.created")}
      schema={batteryFormSchema}
      fields={fields}
      intent="save-battery"
      hiddenFields={{ id: battery?.id }}
      defaultValues={{
        name: battery?.name ?? "",
        capacityKwh: decimal(battery?.capacityWh),
        maxChargeKw: decimal(battery?.maxChargeW),
        maxDischargeKw: decimal(battery?.maxDischargeW),
        installedOn: battery?.installedOn ?? "",
      }}
      contentClassName="sm:max-w-md"
    />
  );
}
