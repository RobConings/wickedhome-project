import * as React from "react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import type { Appliance } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type AppliancePickerProps = SelectionsPickerBaseProps & {
  appliances: Pick<Appliance, "id" | "name" | "category" | "place">[];
};

/**
 * Choose an appliance, with the user's favourites and recently used ones on top. Works in a `<Form>` via
 * `name`. After the form saves, call `useSelections("appliance").recordUse(id)`.
 */
export function AppliancePicker({ appliances, placeholder, ...props }: AppliancePickerProps) {
  const { t } = useTranslation("energy");

  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      appliances.map((appliance) => ({
        id: appliance.id,
        label: appliance.name,
        description: [t(`categories.${appliance.category}`), appliance.place?.name].filter(Boolean).join(" · "),
        leading: <ApplianceCategoryIcon category={appliance.category} className="text-muted-foreground" />,
        keywords: appliance.place ? [appliance.place.name, appliance.place.floorName] : [],
      })),
    [appliances, t],
  );

  return (
    <SelectionsPicker
      {...props}
      entityType="appliance"
      items={items}
      awaitFavorite={false}
      placeholder={placeholder ?? t("appliances.picker.placeholder")}
    />
  );
}
