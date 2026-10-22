import { cn } from "@/lib/utils";
import type { Opening, Place, PlanElement, Wall } from "../types/places";
import { OpeningGlyph } from "./floor-plan-canvas";
import { boundsOf, wallOutline } from "./floor-plan-geometry";
import { PlanCompass } from "./plan-compass";

type FloorPlanThumbnailProps = {
  places: Pick<Place, "id" | "color" | "polygon">[];
  elements: PlanElement[];
  /** Emphasise this place and fade the others. */
  highlightId?: string;
  /** Accessible description; without it the thumbnail is decorative. */
  label?: string;
  /** North on the plan: a small compass in the corner when known. */
  north?: number | null;
  className?: string;
};

/** A small, static drawing of a floor plan that scales to its box. Draws nothing when the plan is empty. */
export function FloorPlanThumbnail({ north = null, ...props }: FloorPlanThumbnailProps) {
  const drawing = <ThumbnailDrawing {...props} />;
  if (north === null) return drawing;
  return (
    <div className="relative">
      {drawing}
      <PlanCompass north={north} size="sm" className="absolute top-0 right-0" />
    </div>
  );
}

function ThumbnailDrawing({ places, elements, highlightId, label, className }: Omit<FloorPlanThumbnailProps, "north">) {
  const walls = elements.filter((element): element is Wall => element.kind === "wall");
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  const openings = elements.filter((element): element is Opening => element.kind !== "wall");
  const drawn = places.filter((place) => place.polygon);
  const bounds = boundsOf([...drawn.flatMap((place) => place.polygon ?? []), ...walls.flatMap((wall) => [wall.a, wall.b])]);
  if (!bounds) return null;

  const padding = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.06 + 20;
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding,
    bounds.maxX - bounds.minX + padding * 2,
    bounds.maxY - bounds.minY + padding * 2,
  ].join(" ");

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block h-auto w-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {drawn.map((place) => {
        const highlighted = place.id === highlightId;
        const faded = highlightId !== undefined && !highlighted;
        return (
          <polygon
            key={place.id}
            points={(place.polygon ?? []).map((point) => `${point.x},${point.y}`).join(" ")}
            fill={place.color}
            fillOpacity={highlighted ? 0.45 : faded ? 0.08 : 0.2}
            stroke={place.color}
            strokeOpacity={faded ? 0.4 : 1}
            strokeWidth={highlighted ? 3 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <g opacity={0.8}>
        {walls.map((wall) => (
          <polygon key={wall.id} points={wallOutline(wall, { caps: true }).map((point) => `${point.x},${point.y}`).join(" ")} className="fill-foreground" />
        ))}
      </g>
      {openings.map((opening) => {
        const wall = wallsById.get(opening.wallId);
        return wall ? <OpeningGlyph key={opening.id} wall={wall} opening={opening} /> : null;
      })}
    </svg>
  );
}
