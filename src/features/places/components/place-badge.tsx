import { HouseIcon, TreesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isOutside, type Place } from "../types/places";

type PlaceBadgeProps = {
  place: Pick<Place, "name" | "kind" | "color" | "icon">;
  /** Also show the floor name, e.g. "Kitchen · Ground floor". */
  floorName?: string;
  className?: string;
};

/** A place at a glance: its colour (or icon), its name and whether it is inside or outside. */
export function PlaceBadge({ place, floorName, className }: PlaceBadgeProps) {
  const { t } = useTranslation("places");
  const outside = isOutside(place);
  const LocationIcon = outside ? TreesIcon : HouseIcon;
  const location = outside ? t("location.outside") : t("location.inside");

  return (
    <Badge variant="outline" className={cn("max-w-full gap-1.5 bg-card py-1 pr-2.5 pl-2 font-medium", className)}>
      {place.icon ? (
        <span className="text-sm leading-none" aria-hidden="true">
          {place.icon}
        </span>
      ) : (
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: place.color }} aria-hidden="true" />
      )}
      <span className="truncate">{place.name}</span>
      {floorName && <span className="truncate font-normal text-muted-foreground">· {floorName}</span>}
      <LocationIcon className="text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">({location})</span>
    </Badge>
  );
}
