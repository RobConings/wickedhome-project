import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { useSelections } from "@/lib/selections";
import { AppliancePicker, type Appliance } from "@/features/energy";
import { PlacePicker, usePlaceSelections, type Place } from "@/features/places";
import type { DevicesActionResult } from "../data/devices-loaders";
import { deviceInputSchema, type Device, type DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";

type DeviceFormDialogProps = {
  /** Edit this device; omit to create one. */
  device?: Device;
  profiles: DeviceProfile[];
  places: Place[];
  appliances: Appliance[];
  /** Preselect a profile for a new device. */
  defaultProfileId?: string;
  trigger: React.ReactElement;
};

const idOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

export function DeviceFormDialog({ device, profiles, places, appliances, defaultProfileId, trigger }: DeviceFormDialogProps) {
  const { t } = useTranslation("devices");
  const { recordUse: recordPlace } = usePlaceSelections();
  const { recordUse: recordAppliance } = useSelections("appliance");
  const isEdit = Boolean(device);
  const initial = { placeId: device?.place?.id ?? null, applianceId: device?.appliance?.id ?? null };
  // What is chosen in the open dialog, to record as "recently used" once it saved.
  const chosen = React.useRef(initial);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("form.namePlaceholder") },
    {
      name: "profileId",
      type: "select",
      label: t("fields.profile"),
      placeholder: t("form.profilePlaceholder"),
      description: isEdit ? t("form.profileChangeHint") : undefined,
      options: profiles.map((profile) => ({ value: profile.id, label: profile.name, icon: <DeviceIcon icon={profile.icon} /> })),
    },
    {
      name: "placeId",
      type: "custom",
      label: t("fields.place"),
      span: "half",
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <PlacePicker
          id={id}
          name={name}
          places={places}
          value={idOrNull(value)}
          onChange={(next) => {
            chosen.current = { ...chosen.current, placeId: next };
            setValue(next);
          }}
          clearable
          invalid={invalid}
          disabled={disabled}
        />
      ),
    },
    {
      name: "applianceId",
      type: "custom",
      label: t("fields.appliance"),
      span: "half",
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <AppliancePicker
          id={id}
          name={name}
          appliances={appliances}
          value={idOrNull(value)}
          onChange={(next) => {
            chosen.current = { ...chosen.current, applianceId: next };
            setValue(next);
          }}
          clearable
          invalid={invalid}
          disabled={disabled}
          placeholder={t("form.appliancePlaceholder")}
        />
      ),
    },
    { name: "notes", type: "textarea", rows: 2, maxLength: 500, label: t("fields.notes") },
  ];

  return (
    <GeneralFormDialog<DevicesActionResult>
      trigger={trigger}
      onOpenChange={(open) => {
        if (open) chosen.current = initial;
      }}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      onSuccess={() => {
        const { placeId, applianceId } = chosen.current;
        if (placeId) void recordPlace(placeId);
        if (applianceId) void recordAppliance(applianceId);
      }}
      schema={deviceInputSchema}
      fields={fields}
      intent="save"
      hiddenFields={{ id: device?.id }}
      defaultValues={{
        name: device?.name ?? "",
        profileId: device?.profileId ?? defaultProfileId ?? profiles[0]?.id ?? "",
        placeId: initial.placeId,
        applianceId: initial.applianceId,
        notes: device?.notes ?? "",
      }}
    />
  );
}
