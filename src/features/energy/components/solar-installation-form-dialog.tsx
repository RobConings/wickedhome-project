import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GeneralFormField, GeneralFormValues } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { currentLocale } from "@/lib/i18n";
import type { EnergyActionResult } from "../data/energy-loaders";
import { COMPASS_POINTS, compassPoint, solarInstallationInputSchema, solarKwp, type SolarInstallation } from "../types/energy";
import { formatKwp } from "./energy-format";

type SolarInstallationFormDialogProps = {
  /** Edit this installation; omit to add one. */
  installation?: SolarInstallation;
  trigger: React.ReactElement;
};

const NONE = "none";

const kwpOf = (values: GeneralFormValues) =>
  solarKwp({ panelCount: Number(values.panelCount) || 0, panelWp: Number(values.panelWp) || 0 });

export function SolarInstallationFormDialog({ installation, trigger }: SolarInstallationFormDialogProps) {
  const { t } = useTranslation("energy");
  const isEdit = Boolean(installation);
  const initialOrientation = installation?.azimuthDeg == null ? NONE : compassPoint(installation.azimuthDeg);

  /** The orientation as degrees; a precise azimuth set elsewhere (e.g. 170°) stays unless another direction is picked. */
  const azimuthFor = (orientation: string) =>
    orientation === NONE
      ? ""
      : orientation === initialOrientation && installation?.azimuthDeg != null
        ? String(installation.azimuthDeg)
        : String(COMPASS_POINTS.indexOf(orientation as (typeof COMPASS_POINTS)[number]) * 45);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("solar.fields.name"), placeholder: t("solar.form.namePlaceholder") },
    { name: "panelCount", type: "number", label: t("solar.fields.panelCount"), span: "half", inputMode: "numeric", min: 1 },
    { name: "panelWp", type: "number", label: t("solar.fields.panelWp"), span: "half", inputMode: "numeric", min: 50 },
    {
      // Not a field: the installation's total power, live from the two above. Posts nothing.
      name: "kwpTotal",
      type: "custom",
      label: t("solar.fields.panelCount"),
      bare: true,
      when: (values) => kwpOf(values) > 0,
      render: ({ values }) => (
        <p className="-mt-2 text-sm text-muted-foreground">{t("solar.total", { kwp: formatKwp(kwpOf(values), currentLocale()) })}</p>
      ),
    },
    {
      // The person picks a compass direction; the form posts it as degrees.
      name: "azimuthDeg",
      type: "custom",
      label: t("solar.fields.orientation"),
      span: "half",
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => {
        const orientation = typeof value === "string" ? value : NONE;
        return (
          <>
            <input type="hidden" name={name} value={azimuthFor(orientation)} />
            <Select value={orientation} onValueChange={setValue} disabled={disabled}>
              <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("solar.form.orientationNone")}</SelectItem>
                {COMPASS_POINTS.map((point) => (
                  <SelectItem key={point} value={point}>
                    {t(`compass.${point}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        );
      },
    },
    { name: "tiltDeg", type: "number", label: t("solar.fields.tiltDeg"), span: "half", inputMode: "numeric", min: 0, max: 90 },
    { name: "inverterBrand", type: "text", label: t("solar.fields.inverterBrand"), span: "half" },
    { name: "inverterModel", type: "text", label: t("solar.fields.inverterModel"), span: "half" },
    { name: "installedOn", type: "date", label: t("solar.fields.installedOn") },
  ];

  return (
    <GeneralFormDialog<EnergyActionResult>
      trigger={trigger}
      title={isEdit ? t("solar.form.editTitle") : t("solar.form.createTitle")}
      description={t("solar.form.description")}
      successMessage={isEdit ? t("solar.form.updated") : t("solar.form.created")}
      schema={solarInstallationInputSchema}
      fields={fields}
      intent="save-solar"
      hiddenFields={{ id: installation?.id }}
      defaultValues={{
        name: installation?.name ?? "",
        panelCount: installation?.panelCount ?? "",
        panelWp: installation?.panelWp ?? "",
        azimuthDeg: initialOrientation,
        tiltDeg: installation?.tiltDeg ?? "",
        inverterBrand: installation?.inverterBrand ?? "",
        inverterModel: installation?.inverterModel ?? "",
        installedOn: installation?.installedOn ?? "",
      }}
    />
  );
}
