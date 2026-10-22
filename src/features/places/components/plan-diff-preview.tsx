import { useTranslation } from "react-i18next";
import type { AssistantPreviewRendererProps } from "@/features/assistant";
import { cn } from "@/lib/utils";
import { planDiffDataSchema, type PlanDiffData, type PlanDiffPoint, type PlanDiffState } from "../types/plan-diff";
import { boundsOf, polygonCentroid, wallOutline } from "./floor-plan-geometry";
import { PlanCompass } from "./plan-compass";

/**
 * The assistant's floor-plan preview (`kind: "plan-diff"`) on a confirmation card: the floor after the
 * proposed change, with new things in green, changed ones in the primary colour (their old outline dashed)
 * and removed ones dashed red. Static SVG that scales to the card, token colours, so dark mode follows.
 * Registered lazily in src/app/assistant-previews.ts. The data comes from the server: validated here.
 */
export default function PlanDiffPreview({ preview }: AssistantPreviewRendererProps) {
  const { t } = useTranslation("places");
  const parsed = planDiffDataSchema.safeParse(preview.data);
  if (!parsed.success) return <p className="text-sm text-muted-foreground">{t("planDiff.invalid")}</p>;
  const data = parsed.data;
  const states = new Set<PlanDiffState>([...data.rooms, ...data.walls, ...data.openings, ...(data.markers ?? [])].map((item) => item.state));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <PlanDiffDrawing data={data} label={t("planDiff.label", { floor: data.floor })} />
        {data.north !== null && <PlanCompass north={data.north} size="sm" className="absolute top-0 right-0" />}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(["added", "changed", "removed"] as const)
          .filter((state) => states.has(state))
          .map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("inline-block h-0.5 w-4 rounded-full bg-current", TONE[state], state === "removed" && "opacity-80")} />
              {t(`planDiff.${state}`)}
            </li>
          ))}
      </ul>
    </div>
  );
}

const TONE: Record<PlanDiffState, string> = {
  same: "text-muted-foreground",
  added: "text-success",
  changed: "text-primary",
  removed: "text-destructive",
};

const pointsOf = (points: readonly PlanDiffPoint[]) => points.map(([x, y]) => `${x},${y}`).join(" ");
const toPoint = ([x, y]: PlanDiffPoint) => ({ x, y });

function PlanDiffDrawing({ data, label }: { data: PlanDiffData; label: string }) {
  const all = [
    ...data.rooms.flatMap((room) => [...room.points, ...(room.before ?? [])]),
    ...data.walls.flatMap((wall) => [wall.a, wall.b]),
    ...(data.markers ?? []).map((marker) => marker.at),
  ].map(toPoint);
  const bounds = boundsOf(all);
  if (!bounds) return null;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 100);
  const padding = span * 0.06 + 20;
  const viewBox = [bounds.minX - padding, bounds.minY - padding, bounds.maxX - bounds.minX + padding * 2, bounds.maxY - bounds.minY + padding * 2].join(" ");
  // Text and markers in plan units, sized to the drawing so they read the same at every plan size.
  const fontSize = span / 26;
  const labelAll = data.rooms.length <= 8;

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="block h-auto max-h-72 w-full" role="img" aria-label={label}>
      {data.rooms.map((room, index) => {
        const changed = room.state !== "same";
        return (
          <g key={`room-${index}`} className={TONE[room.state]}>
            {room.before && (
              <polygon points={pointsOf(room.before)} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
            <polygon
              points={pointsOf(room.points)}
              fill={room.state === "removed" ? "none" : room.color}
              fillOpacity={changed ? 0.35 : 0.12}
              stroke={changed ? "currentColor" : room.color}
              strokeOpacity={changed ? 1 : 0.6}
              strokeWidth={changed ? 2.5 : 1}
              strokeDasharray={room.state === "removed" ? "6 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {data.walls.map((wall, index) => (
        <polygon
          key={`wall-${index}`}
          points={wallOutline({ id: "", kind: "wall", a: toPoint(wall.a), b: toPoint(wall.b), thickness: wall.thickness }, { caps: true })
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          className={cn(wall.state === "same" ? "fill-foreground" : "fill-current", wall.state !== "same" && TONE[wall.state])}
          fillOpacity={wall.state === "removed" ? 0.35 : wall.state === "same" ? 0.7 : 0.9}
        />
      ))}
      {data.openings.map((opening, index) => (
        <g key={`opening-${index}`} className={opening.state === "same" ? "text-foreground" : TONE[opening.state]} strokeOpacity={opening.state === "same" ? 0.7 : 1}>
          {/* The gap in the wall, then the window line or the door leaf with its swing. */}
          <line x1={opening.a[0]} y1={opening.a[1]} x2={opening.b[0]} y2={opening.b[1]} className="stroke-background" strokeWidth={6} vectorEffect="non-scaling-stroke" />
          {opening.kind === "window" || !opening.hinge || !opening.tip ? (
            <line x1={opening.a[0]} y1={opening.a[1]} x2={opening.b[0]} y2={opening.b[1]} stroke="currentColor" strokeWidth={2} strokeDasharray={opening.state === "removed" ? "4 3" : undefined} vectorEffect="non-scaling-stroke" />
          ) : (
            <DoorSwing hinge={opening.hinge} tip={opening.tip} a={opening.a} b={opening.b} dashed={opening.state === "removed"} />
          )}
        </g>
      ))}
      {(data.markers ?? []).map((marker, index) => (
        <g key={`marker-${index}`} className={TONE[marker.state === "same" ? "changed" : marker.state]}>
          <circle cx={marker.at[0]} cy={marker.at[1]} r={fontSize * 0.45} fill="currentColor" />
          <text x={marker.at[0] + fontSize * 0.7} y={marker.at[1]} dominantBaseline="middle" fontSize={fontSize * 0.85} className="fill-foreground">
            {marker.name}
          </text>
        </g>
      ))}
      {data.rooms
        .filter((room) => room.state !== "removed" && (labelAll || room.state !== "same"))
        .map((room, index) => {
          const centre = polygonCentroid(room.points.map(toPoint));
          return (
            <text
              key={`label-${index}`}
              x={centre.x}
              y={centre.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              className={cn("fill-foreground", room.state === "same" ? "opacity-60" : "font-semibold")}
            >
              {room.name}
            </text>
          );
        })}
    </svg>
  );
}

/** A door leaf (hinge → tip) and its quarter-circle swing back to the closed position. */
function DoorSwing({ hinge, tip, a, b, dashed }: { hinge: PlanDiffPoint; tip: PlanDiffPoint; a: PlanDiffPoint; b: PlanDiffPoint; dashed: boolean }) {
  const free = hinge[0] === a[0] && hinge[1] === a[1] ? b : a;
  const radius = Math.hypot(free[0] - hinge[0], free[1] - hinge[1]);
  // With y pointing down, a positive cross product means clockwise (SVG sweep flag 1).
  const cross = (tip[0] - hinge[0]) * (free[1] - hinge[1]) - (tip[1] - hinge[1]) * (free[0] - hinge[0]);
  const dash = dashed ? "4 3" : undefined;
  return (
    <>
      <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke="currentColor" strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      <path
        d={`M ${tip[0]} ${tip[1]} A ${radius} ${radius} 0 0 ${cross > 0 ? 1 : 0} ${free[0]} ${free[1]}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray={dash ?? "3 2"}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}
