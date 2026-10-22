import * as React from "react";
import { HouseIcon, TreesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "./entity-picker";
import type { UseSelectionsOptions } from "@/lib/selections";
import { usePlaceSelections } from "../data/use-place-selections";
import { isOutside, type Place } from "../types/places";

type PlacePickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  /** Places to choose from, e.g. from `fetchPlaces()`. */
  places: Place[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose a room or zone, with the user's favourite and recently used places on top. Works in a `<Form>`
 * via `name`. After the form saves, call `recordUse(placeId)` from `usePlaceSelections()`.
 */
export function PlacePicker({ places, initialSelections, placeholder, loading, ...props }: PlacePickerProps) {
  const { t } = useTranslation("places");
  const selections = usePlaceSelections({ initial: initialSelections });
  const { favoriteIds, recentIds, toggleFavorite } = selections;

  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      places.map((place) => {
        const location = isOutside(place) ? t("location.outside") : t("location.inside");
        const LocationIcon = isOutside(place) ? TreesIcon : HouseIcon;
        return {
          id: place.id,
          label: place.name,
          description: `${place.floorName} · ${location}`,
          leading: place.icon ? (
            <span className="w-4 text-center text-sm leading-none" aria-hidden="true">
              {place.icon}
            </span>
          ) : (
            <span className="relative grid size-4 place-items-center" aria-hidden="true">
              <LocationIcon className="size-4 text-muted-foreground" />
              <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-popover" style={{ backgroundColor: place.color }} />
            </span>
          ),
          keywords: [place.floorName, location],
        };
      }),
    [places, t],
  );

  return (
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      loading={loading || selections.loading}
      onToggleFavorite={(id) => void toggleFavorite(id).catch(() => toast.error(t("picker.favoriteFailed")))}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
