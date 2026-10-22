import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { formatNumber } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { EnergyActionResult } from "../data/energy-loaders";
import { energySettingsFormSchema, type EnergySettings } from "../types/energy";

type GasSettingsFormDialogProps = {
  settings: EnergySettings;
  trigger: React.ReactElement;
};

/** The gas connection: EAN and the calorific value used to turn manual m³ readings into kWh. */
export function GasSettingsFormDialog({ settings, trigger }: GasSettingsFormDialogProps) {
  const { t } = useTranslation("energy");

  const fields: GeneralFormField[] = [
    { name: "gasEan", type: "text", inputMode: "numeric", label: t("gas.fields.ean"), optional: true },
    {
      name: "gasCalorificKwhPerM3",
      type: "text",
      inputMode: "decimal",
      label: t("gas.fields.calorific"),
      description: t("gas.form.calorificHint"),
    },
  ];

  return (
    <GeneralFormDialog<EnergyActionResult>
      trigger={trigger}
      title={t("gas.form.title")}
      description={t("gas.form.description")}
      successMessage={t("gas.form.saved")}
      schema={energySettingsFormSchema}
      fields={fields}
      intent="save-gas-settings"
      defaultValues={{
        gasEan: settings.gasEan ?? "",
        gasCalorificKwhPerM3: formatNumber(settings.gasCalorificKwhPerM3, currentLocale(), { useGrouping: false, maximumFractionDigits: 3 }),
      }}
      contentClassName="sm:max-w-md"
    />
  );
}
