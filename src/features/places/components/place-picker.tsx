import * as React from "react";
import { HouseIcon, TreesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import { isOutside, type Place } from "../types/places";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type PlacePickerProps = SelectionsPickerBaseProps & {
  /** Places to choose from, e.g. from `fetchPlaces()`. */
  places: Place[];
};

/**
 * Choose a room or zone, with the user's favourite and recently used places on top. Works in a `<Form>`
 * via `name`. After the form saves, call `recordUse(placeId)` from `usePlaceSelections()`.
 */
export function PlacePicker({ places, placeholder, ...props }: PlacePickerProps) {
  const { t } = useTranslation("places");

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
    <SelectionsPicker
      {...props}
      entityType="place"
      items={items}
      waitForSelections
      awaitFavorite={false}
      favoriteFailedMessage={t("picker.favoriteFailed")}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
