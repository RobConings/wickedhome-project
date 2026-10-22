import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { currentLocale } from "@/lib/i18n";
import type { Place } from "../types/places";
import { formatArea } from "./place-format";

/** One place in a floor's list; opens the place detail page. */
export function PlaceListItem({ place }: { place: Place }) {
  const { t } = useTranslation("places");
  return (
    <Link
      to={`/places/${place.id}`}
      className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg text-base"
        style={{ backgroundColor: `color-mix(in srgb, ${place.color} 22%, transparent)`, color: place.color }}
        aria-hidden="true"
      >
        {place.icon ?? <span className="size-2.5 rounded-full" style={{ backgroundColor: place.color }} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{place.name}</span>
        <span className="text-xs text-muted-foreground">
          {place.areaM2 !== null ? formatArea(place.areaM2, currentLocale()) : t("list.notDrawn")}
        </span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
