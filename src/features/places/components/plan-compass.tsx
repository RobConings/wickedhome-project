import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { COMPASS_POINTS, compassPoint, normalizeDegrees, screenAngle, topFacing } from "./plan-orientation";

type PlanCompassProps = {
  /** North on the plan (degrees clockwise from up), or null when not set yet. */
  north: number | null;
  /** The plan is drawn turned by this many degrees (e.g. "north up" in the read-only view). */
  viewRotation?: number;
  /** The sun's position (azimuth from true north, elevation above the horizon), shown on the ring. */
  sun?: { azimuth: number; elevation: number } | null;
  /**
   * Makes the rose a dial: drag it (or use the arrow keys) to turn north. `move` while dragging, `end` when
   * released, `key` for each key press.
   */
  onChange?: (north: number, phase: "move" | "end" | "key") => void;
  size?: "sm" | "md";
  className?: string;
};

const LETTER_RADIUS = 35;
const NEEDLE_RADIUS = 24;
const SUN_RADIUS = 45;

const at = (angle: number, radius: number) => {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.sin(radians) * radius, y: -Math.cos(radians) * radius };
};

/**
 * A compass rose with N, E, S and W where they really are on the plan. As a dial (`onChange`) it is a
 * slider: drag it round, or arrow keys (Shift: 15°, Page Up/Down: 45°, Home: north up).
 */
export function PlanCompass({ north, viewRotation = 0, sun, onChange, size = "md", className }: PlanCompassProps) {
  const { t } = useTranslation("places");
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef<number | null>(null);
  const known = north !== null;
  const value = north ?? 0;
  const letters = (["n", "e", "s", "w"] as const).map((key, index) => ({ key, ...at(screenAngle(value, index * 90, viewRotation), LETTER_RADIUS) }));
  const needle = screenAngle(value, 0, viewRotation);
  const sunUp = sun && sun.elevation > 0 ? at(screenAngle(value, sun.azimuth, viewRotation), SUN_RADIUS) : null;
  const description = known
    ? t("orientation.compassValue", { degrees: Math.round(value), facing: t(`orientation.names.${compassPoint(topFacing(value))}`) })
    : t("orientation.notSet");

  /** North for a pointer at this spot: the direction from the middle of the rose, minus the view's turn. */
  function northAt(event: React.PointerEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return value;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const step = event.shiftKey ? 15 : 1;
    const angle = normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI - viewRotation);
    return normalizeDegrees(Math.round(angle / step) * step);
  }

  const interactive = Boolean(onChange);
  const dialProps: React.HTMLAttributes<HTMLDivElement> = interactive
    ? {
        role: "slider",
        tabIndex: 0,
        "aria-label": t("orientation.dial"),
        "aria-valuemin": 0,
        "aria-valuemax": 359,
        "aria-valuenow": Math.round(value),
        "aria-valuetext": description,
        onPointerDown: (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          dragging.current = event.pointerId;
          onChange?.(northAt(event), "move");
        },
        onPointerMove: (event) => {
          if (dragging.current !== event.pointerId) return;
          onChange?.(northAt(event), "move");
        },
        onPointerUp: (event) => {
          if (dragging.current !== event.pointerId) return;
          dragging.current = null;
          onChange?.(northAt(event), "end");
        },
        onPointerCancel: () => {
          if (dragging.current === null) return;
          dragging.current = null;
          onChange?.(value, "end");
        },
        onKeyDown: (event) => {
          const big = event.shiftKey ? 15 : 1;
          const delta: Record<string, number> = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: 45, PageDown: -45 };
          let next: number | null = null;
          if (event.key in delta) next = normalizeDegrees(Math.round(value) + (delta[event.key] ?? 0));
          else if (event.key === "Home") next = 0;
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          onChange?.(next, "key");
        },
      }
    : { role: "img", "aria-label": description };

  return (
    <div
      ref={ref}
      {...dialProps}
      title={interactive ? t("orientation.dialHint") : description}
      className={cn(
        "relative grid shrink-0 touch-none place-items-center rounded-full border bg-popover/95 shadow-sm backdrop-blur select-none",
        size === "md" ? "size-20" : "size-12",
        interactive && "cursor-grab outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
        className,
      )}
    >
      <svg viewBox="-50 -50 100 100" className="size-full" aria-hidden="true">
        <circle r={42} className="fill-none stroke-border" strokeWidth={1.5} />
        {Array.from({ length: COMPASS_POINTS.length }, (_, index) => {
          const angle = screenAngle(value, index * 45, viewRotation);
          const inner = at(angle, index % 2 === 0 ? 39 : 40);
          const outer = at(angle, 44);
          return known ? (
            <line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="stroke-muted-foreground/60" strokeWidth={1.5} />
          ) : null;
        })}
        {known ? (
          <>
            <g transform={`rotate(${needle})`}>
              <polygon points={`0,${-NEEDLE_RADIUS} 6,0 -6,0`} className="fill-highlight-strong" />
              <polygon points={`0,${NEEDLE_RADIUS} 6,0 -6,0`} className="fill-muted-foreground/35" />
            </g>
            <circle r={2.5} className="fill-card stroke-muted-foreground" strokeWidth={1} />
            {size === "md" &&
              letters.map((letter) => (
                <text
                  key={letter.key}
                  x={letter.x}
                  y={letter.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn("text-[13px] font-semibold", letter.key === "n" ? "fill-highlight-strong" : "fill-muted-foreground")}
                >
                  {t(`orientation.points.${letter.key}`)}
                </text>
              ))}
            {size === "sm" && letters[0] && (
              <text x={letters[0].x} y={letters[0].y} textAnchor="middle" dominantBaseline="central" className="fill-highlight-strong text-[22px] font-bold">
                {t("orientation.points.n")}
              </text>
            )}
          </>
        ) : (
          <text textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground text-[22px] font-semibold">
            ?
          </text>
        )}
        {sunUp && (
          <g data-accent="energy">
            <circle cx={sunUp.x} cy={sunUp.y} r={6} className="fill-section stroke-card" strokeWidth={2} />
          </g>
        )}
      </svg>
    </div>
  );
}
