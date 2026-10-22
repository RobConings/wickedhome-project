import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { PlacePicker, usePlaceSelections, type Place } from "@/features/places";
import type { EnergyActionResult } from "../data/energy-loaders";
import { ACTIVE_CARRIERS, APPLIANCE_CATEGORIES, applianceInputSchema, type ActiveCarrier, type Appliance } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { CARRIER_ICONS } from "./carrier-icons";

type ApplianceFormDialogProps = {
  /** Edit this appliance; omit to create a new one. */
  appliance?: Appliance;
  /** Places to choose from. */
  places: Place[];
  /** Preselect a place for a new appliance (e.g. "add" inside a place group). */
  defaultPlaceId?: string | null;
  trigger: React.ReactElement;
};

const asCarriers = (value: unknown): ActiveCarrier[] =>
  Array.isArray(value) ? ACTIVE_CARRIERS.filter((carrier) => value.includes(carrier)) : ["electricity"];

export function ApplianceFormDialog({ appliance, places, defaultPlaceId, trigger }: ApplianceFormDialogProps) {
  const { t } = useTranslation("energy");
  const { recordUse } = usePlaceSelections();
  const isEdit = Boolean(appliance);
  const initialPlaceId = appliance?.placeId ?? defaultPlaceId ?? null;
  const initialCarriers = (appliance?.carriers.filter((carrier) => carrier !== "water") ?? ["electricity"]) as ActiveCarrier[];
  // The place chosen in the open dialog, to record as "recently used" once it saved.
  const chosenPlace = React.useRef<string | null>(initialPlaceId);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("appliances.fields.name") },
    {
      name: "category",
      type: "select",
      label: t("appliances.fields.category"),
      span: "half",
      options: APPLIANCE_CATEGORIES.map((category) => ({
        value: category,
        label: t(`categories.${category}`),
        icon: <ApplianceCategoryIcon category={category} />,
      })),
    },
    {
      name: "placeId",
      type: "custom",
      label: t("appliances.fields.place"),
      span: "half",
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <PlacePicker
          id={id}
          name={name}
          places={places}
          value={typeof value === "string" && value !== "" ? value : null}
          onChange={(next) => {
            chosenPlace.current = next;
            setValue(next);
          }}
          clearable
          invalid={invalid}
          disabled={disabled}
          placeholder={t("appliances.form.placePlaceholder")}
        />
      ),
    },
    {
      name: "carriers",
      type: "custom",
      label: t("appliances.fields.carriers"),
      bare: true,
      render: ({ id, name, value, setValue, errors, disabled }) => {
        const carriers = asCarriers(value);
        return (
          <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled} aria-describedby={`${id}-hint`}>
            <legend className="mb-2 text-sm font-medium">{t("appliances.fields.carriers")}</legend>
            <input type="hidden" name={name} value={carriers.join(",")} />
            <div className="flex flex-wrap gap-2">
              {ACTIVE_CARRIERS.map((carrier) => {
                const Icon = CARRIER_ICONS[carrier];
                const checked = carriers.includes(carrier);
                return (
                  <label
                    key={carrier}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() =>
                        // At least one carrier stays selected.
                        setValue(
                          checked
                            ? carriers.length > 1
                              ? carriers.filter((item) => item !== carrier)
                              : carriers
                            : ACTIVE_CARRIERS.filter((item) => item === carrier || carriers.includes(item)),
                        )
                      }
                    />
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {t(`carriers.${carrier}`)}
                  </label>
                );
              })}
            </div>
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {t("appliances.form.carriersHint")}
            </p>
            {errors && <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p>}
          </fieldset>
        );
      },
    },
    {
      name: "ratedPowerW",
      type: "number",
      label: t("appliances.fields.ratedPowerW"),
      span: "half",
      inputMode: "numeric",
      min: 0,
      step: 1,
    },
    {
      name: "standbyPowerW",
      type: "number",
      label: t("appliances.fields.standbyPowerW"),
      span: "half",
      inputMode: "numeric",
      min: 0,
      step: 1,
    },
    { name: "notes", type: "textarea", rows: 2, maxLength: 500, label: t("appliances.fields.notes") },
  ];

  return (
    <GeneralFormDialog<EnergyActionResult>
      trigger={trigger}
      onOpenChange={(open) => {
        if (open) chosenPlace.current = initialPlaceId;
      }}
      title={isEdit ? t("appliances.form.editTitle") : t("appliances.form.createTitle")}
      description={t("appliances.form.description")}
      successMessage={isEdit ? t("appliances.form.updated") : t("appliances.form.created")}
      onSuccess={() => {
        if (chosenPlace.current) void recordUse(chosenPlace.current);
      }}
      schema={applianceInputSchema}
      fields={fields}
      intent="save"
      hiddenFields={{ id: appliance?.id }}
      defaultValues={{
        name: appliance?.name ?? "",
        category: appliance?.category ?? "other",
        placeId: initialPlaceId,
        carriers: initialCarriers,
        ratedPowerW: appliance?.ratedPowerW ?? "",
        standbyPowerW: appliance?.standbyPowerW ?? "",
        notes: appliance?.notes ?? "",
      }}
    />
  );
}
