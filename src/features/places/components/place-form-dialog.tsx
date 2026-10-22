import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { GeneralFormCustomFieldProps, GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { PlacesActionResult } from "../data/places-loaders";
import { PLACE_COLORS, placeInputSchema, placeKindForFloor, type Floor, type FloorKind, type Place } from "../types/places";
import { PlaceBadge } from "./place-badge";

type PlaceFormDialogProps = {
  /** Floors to choose from. */
  floors: Floor[];
  /** Edit this place; omit to create a new one. */
  place?: Place;
  /** Floor preselected for a new place. */
  defaultFloorId?: string;
  trigger: React.ReactElement;
};

/** Create or edit a place from a plain form. Drawing its outline is optional and happens in the editor. */
export function PlaceFormDialog({ floors, place, defaultFloorId, trigger }: PlaceFormDialogProps) {
  const { t } = useTranslation("places");
  const isEdit = Boolean(place);
  const initialFloorId = place?.floorId ?? defaultFloorId ?? floors[0]?.id ?? "";
  const floorKindOf = (floorId: unknown): FloorKind => floors.find((floor) => floor.id === floorId)?.kind ?? "indoor";

  /** A text input whose placeholder follows the chosen floor (a room inside, a zone outside). */
  const textWithPlaceholder =
    (placeholder: (kind: FloorKind) => string, extra?: { maxLength?: number; className?: string }) =>
    ({ id, name, value, setValue, values, invalid, describedBy, disabled }: GeneralFormCustomFieldProps) => (
      <Input
        id={id}
        name={name}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder(floorKindOf(values.floorId))}
        autoComplete="off"
        maxLength={extra?.maxLength}
        className={extra?.className}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    );

  const fields: GeneralFormField[] = [
    {
      name: "name",
      type: "custom",
      label: t("fields.name"),
      render: textWithPlaceholder((kind) => t(`place.form.namePlaceholder.${kind}`)),
    },
    {
      name: "floorId",
      type: "select",
      label: t("fields.floor"),
      description: isEdit ? t("place.form.floorHelp") : undefined,
      options: floors.map((floor) => ({ value: floor.id, label: floor.name })),
    },
    { name: "color", type: "color", label: t("fields.color"), colors: PLACE_COLORS },
    {
      name: "icon",
      type: "custom",
      label: t("fields.icon"),
      description: t("place.form.iconHelp"),
      render: textWithPlaceholder((kind) => (kind === "outdoor" ? "🌳" : "🛋️"), { maxLength: 8, className: "w-24" }),
    },
  ];

  return (
    <GeneralFormDialog<PlacesActionResult>
      trigger={trigger}
      title={isEdit ? t("place.form.editTitle") : t("place.form.createTitle")}
      description={t("place.form.description")}
      media={(values) => (
        <PlaceBadge
          place={{
            name: (typeof values.name === "string" && values.name) || t("place.form.previewName"),
            kind: placeKindForFloor(floorKindOf(values.floorId)),
            color: typeof values.color === "string" && values.color ? values.color : PLACE_COLORS[0],
            icon: (typeof values.icon === "string" && values.icon) || null,
          }}
        />
      )}
      successMessage={isEdit ? t("place.form.updated") : t("place.form.created")}
      schema={placeInputSchema}
      fields={fields}
      intent={isEdit ? "update-place" : "create-place"}
      hiddenFields={{ id: place?.id }}
      defaultValues={{
        name: place?.name ?? "",
        floorId: initialFloorId,
        color: place?.color ?? PLACE_COLORS[0],
        icon: place?.icon ?? "",
      }}
      contentClassName="sm:max-w-md"
    />
  );
}
