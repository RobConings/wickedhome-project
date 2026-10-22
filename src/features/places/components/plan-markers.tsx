import type * as React from "react";
import { MapPinPlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A generic marker layer for floor plans. Places knows nothing about what a marker stands for (a device,
// later maybe a task or a plant): other features build markers and the route hands them to the plan.

/** Semantic colour of a marker; follows the theme. */
export type PlanMarkerTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Any SVG icon component that accepts SVG props, e.g. a lucide icon. */
export type PlanMarkerIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export type PlanMarker = {
  id: string;
  /** Plan coordinates in cm (like walls and outlines). */
  x: number;
  y: number;
  tone: PlanMarkerTone;
  /** Custom `#rrggbb` that overrides the tone's colour. */
  color?: string | null;
  /** Accessible name and tooltip: "Kitchen window · Open". */
  label: string;
  icon?: PlanMarkerIcon | null;
  /** Short text under the marker: "21,5 °C". */
  value?: string | null;
  /** Draw attention with a pulsing ring. */
  pulse?: boolean;
  /** Faded, e.g. when the state is unknown or stale. */
  dimmed?: boolean;
};

/** A marker that is not on the plan yet, offered in the editor's palette. */
export type PlanMarkerPaletteEntry = Pick<PlanMarker, "id" | "tone" | "color" | "label" | "icon"> & {
  /** Second line, e.g. the room. */
  description?: string | null;
};

/** dataTransfer type used when dragging a palette entry onto the plan. */
export const PLAN_MARKER_DRAG_TYPE = "application/x-wickedhome-plan-marker";

const TONE_FILL: Record<PlanMarkerTone, string> = {
  success: "fill-success",
  warning: "fill-warning",
  danger: "fill-destructive",
  info: "fill-info",
  neutral: "fill-muted-foreground",
};

const TONE_BG: Record<PlanMarkerTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

/** Marker radius in screen pixels. */
export const PLAN_MARKER_RADIUS = 12;

type PlanMarkerGlyphProps = Omit<React.SVGProps<SVGGElement>, "x" | "y"> & {
  marker: PlanMarker;
  /** Screen position (the marker keeps its size at every zoom level). */
  at: { x: number; y: number };
  selected?: boolean;
};

/** One marker on the SVG plan, in screen space. */
export function PlanMarkerGlyph({ marker, at, selected, className, ...props }: PlanMarkerGlyphProps) {
  const Icon = marker.icon;
  const r = PLAN_MARKER_RADIUS;
  const fill = marker.color ?? undefined;
  const toneClass = marker.color ? undefined : TONE_FILL[marker.tone];
  return (
    <g transform={`translate(${at.x} ${at.y})`} className={cn("outline-none", className)} opacity={marker.dimmed ? 0.55 : 1} {...props}>
      <title>{marker.value ? `${marker.label} · ${marker.value}` : marker.label}</title>
      {marker.pulse && (
        <circle r={r} fill={fill} className={cn(toneClass, "pointer-events-none origin-center animate-ping opacity-60 [transform-box:fill-box]")} />
      )}
      {selected && <circle r={r + 5} className="pointer-events-none fill-none stroke-primary" strokeWidth={2.5} />}
      <circle
        r={r}
        fill={fill}
        className={cn(toneClass, "stroke-card")}
        strokeWidth={2}
        strokeDasharray={marker.dimmed ? "3 2" : undefined}
      />
      {Icon && (
        <Icon x={-7} y={-7} width={14} height={14} strokeWidth={2.25} className="pointer-events-none text-card" aria-hidden="true" />
      )}
      {marker.value && (
        <text
          y={r + 13}
          textAnchor="middle"
          className="pointer-events-none fill-foreground text-[11px] font-semibold"
          stroke="var(--card)"
          strokeWidth={3}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {marker.value}
        </text>
      )}
    </g>
  );
}

type PlanMarkerDotProps = {
  tone: PlanMarkerTone;
  color?: string | null;
  icon?: PlanMarkerIcon | null;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
};

/** The marker as a small HTML dot, for legends, palettes and lists, so they match the plan. */
export function PlanMarkerDot({ tone, color, icon: Icon, pulse, size = "sm", className }: PlanMarkerDotProps) {
  const box = size === "md" ? "size-6" : "size-3";
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", box, className)} aria-hidden="true">
      {pulse && (
        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", !color && TONE_BG[tone])} style={color ? { backgroundColor: color } : undefined} />
      )}
      <span
        className={cn("relative grid place-items-center rounded-full ring-2 ring-card", box, !color && TONE_BG[tone])}
        style={color ? { backgroundColor: color } : undefined}
      >
        {Icon && size === "md" && <Icon className="size-3.5 text-card" strokeWidth={2.25} />}
      </span>
    </span>
  );
}

type PlanMarkerPaletteItemProps = {
  entry: PlanMarkerPaletteEntry;
  /** Text for screen readers and the tooltip: "Drag onto the plan". */
  hint: string;
  /**
   * Tap-to-place, the alternative to dragging (touch, pen, keyboard): shows a "Place on plan" button. The
   * caller then hands the entry to the plan as `placingMarker`; a tap on the plan places it.
   */
  onPlace?: () => void;
  /** This entry is being placed (the button shows as pressed). */
  placing?: boolean;
  /** The button's text: "Place on plan". */
  placeLabel?: string;
  className?: string;
};

/** A chip for the editor's palette: drag it onto the plan, or press "Place on plan" and tap a spot. */
export function PlanMarkerPaletteItem({ entry, hint, onPlace, placing = false, placeLabel, className }: PlanMarkerPaletteItemProps) {
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(PLAN_MARKER_DRAG_TYPE, entry.id);
        event.dataTransfer.setData("text/plain", entry.label);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={hint}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-lg border bg-card py-1.5 pl-2.5 text-sm shadow-xs select-none hover:bg-accent active:cursor-grabbing",
        onPlace ? "pr-1.5" : "pr-2.5",
        placing && "border-primary ring-2 ring-primary/30",
        className,
      )}
    >
      <PlanMarkerDot tone={entry.tone} color={entry.color} icon={entry.icon} size="md" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">{entry.label}</span>
        {entry.description && <span className="truncate text-xs text-muted-foreground">{entry.description}</span>}
      </span>
      <span className="sr-only">{hint}</span>
      {onPlace && (
        <button
          type="button"
          onClick={onPlace}
          aria-pressed={placing}
          aria-label={`${placeLabel ?? ""}: ${entry.label}`}
          className={cn(
            "ml-1 inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            placing ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10",
          )}
        >
          <MapPinPlusIcon className="size-4" aria-hidden="true" />
          {placeLabel}
        </button>
      )}
    </li>
  );
}

export type PlanLegendItem = {
  tone: PlanMarkerTone;
  color?: string | null;
  label: string;
  pulse?: boolean;
};

type PlanLegendProps = {
  title?: string;
  items: PlanLegendItem[];
  /** `inline` puts the title and items on wrapping lines, for compact overlays. */
  layout?: "list" | "inline";
  className?: string;
};

/** What the marker colours mean. Fill it with whatever the markers stand for. */
export function PlanLegend({ title, items, layout = "list", className }: PlanLegendProps) {
  if (items.length === 0) return null;
  if (layout === "inline") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
        {title && <span className="font-medium text-foreground">{title}</span>}
        {items.map((item) => (
          <span key={`${item.tone}-${item.color ?? ""}-${item.label}`} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <PlanMarkerDot tone={item.tone} color={item.color} pulse={item.pulse} />
            {item.label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs", className)}>
      {title && <p className="font-medium text-foreground">{title}</p>}
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={`${item.tone}-${item.color ?? ""}-${item.label}`} className="flex items-center gap-2 text-muted-foreground">
            <PlanMarkerDot tone={item.tone} color={item.color} pulse={item.pulse} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
