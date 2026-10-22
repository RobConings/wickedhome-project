import * as React from "react";
import { useTranslation } from "react-i18next";
import { EntityPicker, type EntityPickerItem } from "./entity-picker";
import { useSelections, type UseSelectionsOptions } from "@/lib/selections";
import type { Appliance } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";

type AppliancePickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  appliances: Pick<Appliance, "id" | "name" | "category" | "place">[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose an appliance, with the user's favourites and recently used ones on top. Works in a `<Form>` via
 * `name`. After the form saves, call `useSelections("appliance").recordUse(id)`.
 */
export function AppliancePicker({ appliances, initialSelections, placeholder, ...props }: AppliancePickerProps) {
  const { t } = useTranslation("energy");
  const { favoriteIds, recentIds, toggleFavorite } = useSelections("appliance", { initial: initialSelections });

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
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      onToggleFavorite={(id) => void toggleFavorite(id).catch(() => undefined)}
      placeholder={placeholder ?? t("appliances.picker.placeholder")}
    />
  );
}
