import * as React from "react";
import { NavigationIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { sunPosition } from "../lib/sun-position";
import { cn } from "@/lib/utils";
import type { FloorPlan } from "../types/places";
import { FloorPlanCanvas, PlanViewToggle } from "./floor-plan-canvas";
import { initPlanEditor, planEditorReducer } from "./floor-plan-state";
import { compassPoint } from "./plan-orientation";
import type { PlanMarker } from "./plan-markers";

type FloorPlanViewProps = {
  plan: FloorPlan;
  /** Markers on the plan (devices…), built by another feature. */
  markers?: PlanMarker[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** Explains the markers; shown bottom right over the plan (e.g. a `PlanLegend`). */
  legend?: React.ReactNode;
  /** Extra overlays inside the board. */
  children?: React.ReactNode;
  /** Stories: where the imported plan's image comes from (the documents feature by default). */
  underlayUrl?: (fileId: string) => string;
  /** Stories: the moment the sun starts at (now by default). */
  now?: Date;
  className?: string;
};

const noop = () => undefined;
/** Remembered per device: show the plan turned so north is up. */
const NORTH_UP_KEY = "wh-plan-north-up";
const MINUTES_PER_DAY = 24 * 60;
const SUN_STEP_MINUTES = 5;

function readNorthUp(): boolean {
  try {
    return window.localStorage.getItem(NORTH_UP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNorthUp(value: boolean) {
  try {
    window.localStorage.setItem(NORTH_UP_KEY, value ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the setting lasts until the page closes.
  }
}

/**
 * A read-only floor plan to look at: pan, zoom, tap places, and markers with a legend. For live views
 * (the house with its devices); editing lives in `FloorPlanEditor`. An imported architect's plan can be
 * switched on with the button top left; it is drawn under the rooms, walls and markers. Once north is
 * known there is a compass, "north up" (the plan turned, labels and markers upright) and, with the home's
 * coordinates, the sun for any time of today.
 */
export function FloorPlanView(props: FloorPlanViewProps) {
  // Keyed by floor: another floor starts with a fresh view (and fits again).
  return <FloorPlanViewBoard key={props.plan.floor.id} {...props} />;
}

function FloorPlanViewBoard({ plan, markers, selectedMarkerId, onMarkerClick, legend, children, underlayUrl, now, className }: FloorPlanViewProps) {
  const { t } = useTranslation("places");
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, initPlanEditor);
  const [northUp, setNorthUp] = React.useState(readNorthUp);
  const [sunOn, setSunOn] = React.useState(false);

  // A reloaded plan of the same floor (revalidation) replaces the drawing without moving the view.
  const shown = React.useRef(plan);
  React.useEffect(() => {
    if (shown.current === plan) return;
    shown.current = plan;
    dispatch({ type: "loaded", plan });
  }, [plan]);

  const north = state.doc.north;
  const location = plan.location ?? null;
  const canTurn = north !== null && north !== 0;
  const canShowSun = north !== null && location !== null;
  const sun = useSunForToday(sunOn && canShowSun ? location : null, now);

  return (
    <FloorPlanCanvas
      state={state}
      dispatch={dispatch}
      readOnly
      onCompleteOutline={noop}
      markers={markers}
      selectedMarkerId={selectedMarkerId}
      onMarkerClick={onMarkerClick}
      underlayUrl={underlayUrl}
      rotation={northUp && canTurn ? -north : 0}
      sun={sun?.position ?? null}
      toolbar={
        (canTurn || canShowSun) && (
          <>
            {canTurn && (
              <PlanViewToggle
                pressed={northUp}
                onPressedChange={(value) => {
                  setNorthUp(value);
                  writeNorthUp(value);
                }}
                icon={NavigationIcon}
              >
                {t("orientation.view.northUp")}
              </PlanViewToggle>
            )}
            {canShowSun && (
              <PlanViewToggle pressed={sunOn} onPressedChange={setSunOn} icon={SunIcon}>
                {t("orientation.view.sun")}
              </PlanViewToggle>
            )}
            {sun && <SunTimePanel sun={sun} />}
          </>
        )
      }
      className={cn("min-h-[24rem]", className)}
    >
      {legend && (
        <div className="absolute right-4 bottom-4 z-10 max-h-[60%] max-w-[60%] overflow-y-auto rounded-xl border bg-popover/95 p-3 shadow-sm backdrop-blur">
          {legend}
        </div>
      )}
      {children}
    </FloorPlanCanvas>
  );
}

type SunForToday = {
  minutes: number;
  setMinutes: (minutes: number) => void;
  resetToNow: () => void;
  isNow: boolean;
  position: { azimuth: number; elevation: number };
};

/** The sun over the home at a time of today (local time), now unless the slider moved it. */
function useSunForToday(location: { latitude: number; longitude: number } | null, now?: Date): SunForToday | null {
  const [today] = React.useState(() => now ?? new Date());
  const nowMinutes = Math.floor((today.getHours() * 60 + today.getMinutes()) / SUN_STEP_MINUTES) * SUN_STEP_MINUTES;
  const [minutes, setMinutes] = React.useState(nowMinutes);
  const position = React.useMemo(() => {
    if (!location) return null;
    const moment = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, minutes);
    const { azimuth, elevation } = sunPosition(moment, location.latitude, location.longitude);
    return { azimuth, elevation };
  }, [location, today, minutes]);
  if (!position) return null;
  return { minutes, setMinutes, resetToNow: () => setMinutes(nowMinutes), isNow: minutes === nowMinutes, position };
}

/** Time of day for the sun (a slider over today), and where it stands. */
function SunTimePanel({ sun }: { sun: SunForToday }) {
  const { t } = useTranslation("places");
  const sliderId = React.useId();
  const pad = (value: number) => String(value).padStart(2, "0");
  // A time of day (minutes since midnight), 24-hour: "14:05".
  const time = `${pad(Math.floor(sun.minutes / 60))}:${pad(sun.minutes % 60)}`;
  const number = new Intl.NumberFormat(intlLocale(currentLocale()), { maximumFractionDigits: 0 });
  const { azimuth, elevation } = sun.position;

  return (
    <div data-accent="energy" className="flex w-full basis-full flex-col gap-1.5 rounded-xl border bg-popover/95 p-3 shadow-sm backdrop-blur sm:w-72 sm:basis-auto">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={sliderId} className="text-xs font-medium">
          {t("orientation.view.time", { time })}
        </label>
        <Button type="button" size="xs" variant="ghost" disabled={sun.isNow} onClick={sun.resetToNow}>
          {t("orientation.view.now")}
        </Button>
      </div>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={MINUTES_PER_DAY - SUN_STEP_MINUTES}
        step={SUN_STEP_MINUTES}
        value={sun.minutes}
        aria-valuetext={time}
        onChange={(event) => sun.setMinutes(Number(event.target.value))}
        className="h-6 w-full accent-[var(--section)]"
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {elevation > 0
          ? t("orientation.view.sunAt", {
              azimuth: number.format(azimuth),
              direction: t(`orientation.names.${compassPoint(azimuth)}`),
              elevation: number.format(elevation),
            })
          : t("orientation.view.belowHorizon")}
      </p>
    </div>
  );
}
