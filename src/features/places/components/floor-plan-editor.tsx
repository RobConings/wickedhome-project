import * as React from "react";
import { CircleAlertIcon, CircleCheckIcon, CircleDotIcon, ExternalLinkIcon, Redo2Icon, SaveIcon, Undo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useBeforeUnload, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InlineAlert } from "@/components/shared/inline-alert";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FloorPlanActionResult } from "../data/places-loaders";
import { PLACE_COLORS, placeKindForFloor, polygonAreaM2, type FloorPlan, type FloorUnderlay, type Point } from "../types/places";
import { FloorPlanCanvas } from "./floor-plan-canvas";
import { boundsOf, isPointInPolygon, newElementId } from "./floor-plan-geometry";
import {
  PLAN_TOOLS,
  TOOL_KEYS,
  initPlanEditor,
  planEditorReducer,
  removeElement,
  removeOutline,
  toPlanInput,
  updatePlace,
  type PlanDocument,
} from "./floor-plan-state";
import { FloorPlanToolsPanel } from "./floor-plan-tools-panel";
import { PlaceBadge } from "./place-badge";
import type { PlanImportResult } from "./plan-import-types";
import type { PlanMarker } from "./plan-markers";
import { formatArea } from "./place-format";
import { findRoomAt } from "./room-from-walls";
import { quarterTurn } from "./plan-orientation";
import { initialUnderlayScale, labelInside, normalizeRotation, underlayToWorld } from "./underlay-geometry";
import { planOverlaps } from "../types/plan-diagnostics";

// The import dialog (and pdf.js behind it) loads only when someone imports a plan.
const PlanImportDialog = React.lazy(() => import("./plan-import-dialog").then((module) => ({ default: module.PlanImportDialog })));

/**
 * Settings for a freshly imported plan. Redoing the crop of the same file keeps the scale, rotation and
 * position, so what is already traced stays aligned (a quarter turn chosen in the crop step is added); a
 * new file starts in the middle of the drawing, turned as it was in the crop step.
 */
function placeUnderlay(result: PlanImportResult, doc: PlanDocument): FloorUnderlay {
  const { rotation: turn, ...files } = result;
  const previous = doc.underlay;
  if (previous && previous.sourceFileId === files.sourceFileId && previous.unit === files.unit && previous.page === files.page) {
    const middle = { x: files.crop.x - previous.crop.x + files.crop.width / 2, y: files.crop.y - previous.crop.y + files.crop.height / 2 };
    // The crop step started at the old rotation's quarter turn: only a change there turns the underlay.
    const rotation = normalizeRotation(previous.rotation + turn - quarterTurn(previous.rotation));
    return { ...previous, ...files, rotation, center: underlayToWorld(previous, middle) };
  }
  const bounds = boundsOf([
    ...doc.places.flatMap((place) => place.polygon ?? []),
    ...doc.elements.flatMap((element) => (element.kind === "wall" ? [element.a, element.b] : [])),
  ]);
  const hasDrawing = bounds !== null;
  return {
    ...files,
    scale: initialUnderlayScale(files.unit, files.crop),
    calibrated: false,
    rotation: normalizeRotation(turn),
    center: bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 500, y: 400 },
    opacity: 0.5,
    visible: true,
    // Something is drawn already: leave it unlocked so it can be moved into place.
    locked: !hasDrawing,
  };
}

/** Editing needs room for the tools window and a precise pointer; smaller screens get a read-only plan. */
const EDIT_MEDIA_QUERY = "(min-width: 1024px)";

function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=listbox]"));

type FloorPlanEditorProps = {
  plan: FloorPlan;
  /** Adults and owners edit; children only look. */
  canManage: boolean;
  /** Link to a place's detail page. */
  placeHref?: (id: string) => string;
  /** Markers on the plan (e.g. devices), built by another feature and handed in by the route. */
  markers?: PlanMarker[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  /**
   * Placement: markers become draggable and palette entries can be dropped on the plan. The caller saves
   * the position (markers are not part of the plan document or its undo history).
   */
  onMarkerMove?: (id: string, x: number, y: number) => void;
  /** Things to place, e.g. a list of `PlanMarkerPaletteItem`s, shown above the plan while editing. */
  markerPalette?: React.ReactNode;
  /** Tap-to-place: the palette entry being placed; a tap on the plan calls `onMarkerMove` for it (see the canvas). */
  placingMarker?: { id: string; label: string } | null;
  onPlacingCancel?: () => void;
  /** Stories: where underlay images come from (the documents feature by default). */
  underlayUrl?: (fileId: string) => string;
  className?: string;
};

/**
 * The floor plan editor: save bar, the plan canvas and the floating tools window. Keyboard shortcuts and
 * saving live here; drawing and dragging live in the canvas.
 */
export function FloorPlanEditor({
  plan,
  canManage,
  placeHref = (id) => `/places/${id}`,
  markers,
  selectedMarkerId,
  onMarkerClick,
  onMarkerMove,
  markerPalette,
  placingMarker,
  onPlacingCancel,
  underlayUrl,
  className,
}: FloorPlanEditorProps) {
  const { t } = useTranslation("places");
  const [importing, setImporting] = React.useState<null | "new" | "recrop">(null);
  const wide = useMediaQuery(EDIT_MEDIA_QUERY);
  const readOnly = !canManage || !wide;
  const [state, dispatch] = React.useReducer(planEditorReducer, plan, initPlanEditor);
  const fetcher = useFetcher<FloorPlanActionResult>({ key: `floor-plan-${plan.floor.id}` });
  const saving = fetcher.state !== "idle";
  const dirty = state.doc !== state.saved;
  const overlaps = React.useMemo(() => planOverlaps(state.doc.places, state.doc.elements), [state.doc.places, state.doc.elements]);
  const wallNumbers = React.useMemo(() => new Map(state.doc.elements.filter((element) => element.kind === "wall").map((wall, index) => [wall.id, index + 1])), [state.doc.elements]);
  // The last save was refused or failed, and those changes are still unsaved.
  const saveFailed = !saving && dirty && fetcher.data !== undefined && !fetcher.data.ok;
  const floorKind = plan.floor.kind;

  useBeforeUnload(
    React.useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );

  // Apply the save result once.
  const handled = React.useRef<FloorPlanActionResult | undefined>(undefined);
  React.useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (result.ok) {
      dispatch(result.plan ? { type: "loaded", plan: result.plan } : { type: "markSaved" });
      toast.success(t("editor.saved"));
    } else {
      toast.error(result.formError ?? t("editor.saveInvalid"));
    }
  }, [fetcher.state, fetcher.data, t]);

  const save = React.useCallback(() => {
    if (readOnly || saving || state.draft.length > 0) return;
    const unnamed = state.doc.places.find((place) => place.name.trim() === "");
    if (unnamed) {
      toast.error(t("editor.nameRequired"));
      dispatch({ type: "setTool", tool: "select" });
      dispatch({ type: "select", selection: unnamed.polygon ? { type: "place", key: unnamed.key } : null });
      return;
    }
    void fetcher.submit(toPlanInput(state.doc), { method: "post", encType: "application/json" });
  }, [fetcher, readOnly, saving, state.doc, state.draft.length, t]);

  /** A new place: named after the PDF label inside its outline, else "Room 3". */
  const newPlace = React.useCallback(
    (polygon: Point[]) => {
      const label = labelInside(state.doc.underlay, polygon);
      const names = new Set(state.doc.places.map((place) => place.name));
      let number = 1;
      while (names.has(t(`editor.newPlaceName.${floorKind}`, { number }))) number += 1;
      const count = state.doc.places.length;
      return {
        place: {
          key: `new-${newElementId()}`,
          name: label?.name || t(`editor.newPlaceName.${floorKind}`, { number }),
          color: PLACE_COLORS[count % PLACE_COLORS.length] ?? PLACE_COLORS[0],
        },
        label,
      };
    },
    [state.doc.places, state.doc.underlay, floorKind, t],
  );

  const completeOutline = React.useCallback(() => {
    dispatch({ type: "completeOutline", newPlace: newPlace(state.draft).place });
  }, [newPlace, state.draft]);

  /** Fill room: the room around the click, from the walls. Creates a place only on this explicit click. */
  const fill = React.useCallback(
    (point: Point) => {
      const doc = state.doc;
      const result = findRoomAt(doc.elements, point, { gapTolerance: state.gapTolerance });
      if (!result.ok) {
        dispatch({ type: "setFillFeedback", feedback: result.reason === "open" ? { type: "open", gaps: result.gaps } : { type: result.reason } });
        return;
      }
      const { polygon } = result;
      const areaM2 = polygonAreaM2(polygon);
      // Clicked into a room that is already there (about the same outline): show it instead of a copy.
      const existing = doc.places.find(
        (place) => place.polygon && isPointInPolygon(point, place.polygon) && Math.abs(polygonAreaM2(place.polygon) - areaM2) <= Math.max(areaM2 * 0.15, 0.5),
      );
      if (existing) {
        dispatch({ type: "setFillFeedback", feedback: { type: "existing", key: existing.key } });
        return;
      }
      const { place, label } = newPlace(polygon);
      // A room that is listed but not drawn yet, with the label's name, gets this outline.
      const listed = label?.name
        ? doc.places.find((candidate) => !candidate.polygon && candidate.name.trim().toLowerCase() === label.name.toLowerCase())
        : undefined;
      const key = listed?.key ?? place.key;
      const next = listed ? updatePlace(doc, listed.key, { polygon }) : { ...doc, places: [...doc.places, { ...place, icon: null, polygon }] };
      dispatch({ type: "commit", doc: next, selection: null });
      dispatch({ type: "setFillFeedback", feedback: { type: "filled", key, areaM2, planAreaM2: label?.areaM2 ?? null, reused: Boolean(listed) } });
    },
    [state.doc, state.gapTolerance, newPlace],
  );

  const onImported = React.useCallback(
    (result: PlanImportResult) => {
      setImporting(null);
      const underlay = placeUnderlay(result, state.doc);
      dispatch({ type: "commit", doc: { ...state.doc, underlay }, selection: null });
      toast.success(t("editor.import.done"));
      // A new plan needs its scale checked before tracing.
      if (!underlay.calibrated) dispatch({ type: "setTool", tool: "calibrate" });
    },
    [state.doc, t],
  );

  // Keyboard shortcuts (listed in the tools window).
  React.useEffect(() => {
    if (readOnly) return;
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      // While saving the plan is frozen: the saved copy from the server replaces it when done.
      if (saving) {
        if (mod && key === "s") event.preventDefault();
        return;
      }

      if (mod && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (mod && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && key === "s") {
        event.preventDefault();
        save();
      } else if (mod || event.altKey) {
        return;
      } else if (key === "escape") {
        if (state.draft.length > 0) dispatch({ type: "setDraft", draft: [] });
        else if (state.tool === "calibrate" && state.calibration.a) dispatch({ type: "setCalibration", calibration: { a: null, b: null } });
        else if (state.tool === "north" && state.northArrow.a) dispatch({ type: "setNorthArrow", arrow: { a: null, b: null } });
        else if (state.selection) dispatch({ type: "select", selection: null });
        else dispatch({ type: "setTool", tool: "select" });
      } else if (key === "x" && state.tool === "wall" && state.wallAlignment !== "center") {
        // Flip the side of the clicked line the wall grows to.
        dispatch({ type: "setWallAlignment", alignment: state.wallAlignment === "left" ? "right" : "left" });
      } else if (key === "enter") {
        // Enter on a focused button presses the button, nothing else.
        if (event.target instanceof HTMLElement && event.target.closest("button, a")) return;
        if (state.tool === "outline") completeOutline();
        if (state.tool === "wall") dispatch({ type: "setDraft", draft: [] });
      } else if (key === "delete" || key === "backspace") {
        const selection = state.selection;
        if (!selection) return;
        event.preventDefault();
        if (selection.type === "element") {
          dispatch({ type: "commit", doc: removeElement(state.doc, selection.id), selection: null });
          return;
        }
        const polygon = state.doc.places.find((place) => place.key === selection.key)?.polygon;
        if (selection.vertex !== undefined && polygon && polygon.length > 3) {
          const next = polygon.filter((_, index) => index !== selection.vertex);
          dispatch({ type: "commit", doc: updatePlace(state.doc, selection.key, { polygon: next }), selection: { type: "place", key: selection.key } });
        } else {
          dispatch({ type: "commit", doc: removeOutline(state.doc, selection.key), selection: null });
        }
      } else {
        const tool = PLAN_TOOLS.find((candidate) => TOOL_KEYS[candidate].toLowerCase() === key);
        if (tool) dispatch({ type: "setTool", tool });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly, saving, state, save, completeOutline]);

  const selectedPlace =
    readOnly && state.selection?.type === "place"
      ? state.doc.places.find((place) => state.selection?.type === "place" && place.key === state.selection.key)
      : undefined;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {canManage && !wide && <InlineAlert>{t("editor.smallScreen")}</InlineAlert>}
      {overlaps.length > 0 && (
        <InlineAlert tone="warning">
          <p>{t("editor.overlapsHint", { count: overlaps.length })}</p>
          <ul className="mt-1 list-inside list-disc">
            {overlaps.slice(0, 10).map((overlap) => (
              <li key={JSON.stringify([overlap.kind, overlap.first, overlap.second])}>
                {overlap.kind === "room_overlap" ? t("editor.roomOverlap", { first: overlap.first, second: overlap.second }) : (
                  <button type="button" className="text-left underline decoration-dotted underline-offset-2" onClick={() => dispatch({ type: "select", selection: { type: "element", id: overlap.second } })}>
                    {t(overlap.kind === "room_wall_overlap" ? "editor.roomWallOverlap" : "editor.wallOverlap", {
                      first: overlap.kind === "room_wall_overlap" ? overlap.first : wallNumbers.get(overlap.first),
                      second: wallNumbers.get(overlap.second),
                    })}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {overlaps.length > 10 && <p>{t("editor.moreOverlaps", { count: overlaps.length - 10 })}</p>}
        </InlineAlert>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", saveFailed && "text-destructive")}
            aria-live="polite"
          >
            {saving ? (
              <Spinner className="size-3.5" />
            ) : saveFailed ? (
              <CircleAlertIcon className="size-3.5" aria-hidden="true" />
            ) : dirty ? (
              <CircleDotIcon className="size-3.5 text-warning" aria-hidden="true" />
            ) : (
              <CircleCheckIcon className="size-3.5 text-success" aria-hidden="true" />
            )}
            {saving
              ? t("editor.saving")
              : saveFailed
                ? t("editor.saveFailed")
                : dirty
                  ? t("editor.unsaved")
                  : t("editor.allSaved")}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => dispatch({ type: "undo" })}
              disabled={state.past.length === 0}
              aria-label={t("editor.undo")}
              title={`${t("editor.undo")} (Ctrl+Z)`}
            >
              <Undo2Icon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => dispatch({ type: "redo" })}
              disabled={state.future.length === 0}
              aria-label={t("editor.redo")}
              title={`${t("editor.redo")} (Ctrl+Shift+Z)`}
            >
              <Redo2Icon />
            </Button>
            <Button
              type="button"
              onClick={save}
              loading={saving}
              disabled={!dirty || state.draft.length > 0}
              title={state.draft.length > 0 ? t("editor.finishDraftFirst") : `${t("editor.save")} (Ctrl+S)`}
              className="ml-2"
            >
              <SaveIcon />
              {saving ? t("editor.saving") : t("editor.save")}
            </Button>
          </div>
        </div>
      )}

      {!readOnly && markerPalette && (
        <section aria-label={t("editor.markers.palette")} className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{t("editor.markers.paletteHint")}</p>
          {markerPalette}
        </section>
      )}

      <FloorPlanCanvas
        state={state}
        dispatch={dispatch}
        readOnly={readOnly}
        onCompleteOutline={completeOutline}
        markers={markers}
        selectedMarkerId={selectedMarkerId}
        onMarkerClick={onMarkerClick}
        onMarkerMove={readOnly ? undefined : onMarkerMove}
        placingMarker={readOnly ? null : placingMarker}
        onPlacingCancel={onPlacingCancel}
        onFill={fill}
        underlayUrl={underlayUrl}
        // Frozen while saving (see the shortcuts above).
        className={cn("min-h-[28rem] flex-1", saving && "pointer-events-none")}
      >
        {!readOnly && (
          <FloorPlanToolsPanel
            state={state}
            dispatch={dispatch}
            floorKind={floorKind}
            onCompleteOutline={completeOutline}
            placeHref={placeHref}
            onImport={() => setImporting("new")}
            onRecrop={() => setImporting("recrop")}
          />
        )}
        {importing && (
          <React.Suspense
            fallback={
              <div role="status" className="absolute inset-0 z-20 grid place-items-center bg-background/40">
                <span className="inline-flex items-center gap-2 rounded-full border bg-popover px-4 py-2 text-sm shadow-md">
                  <Spinner className="size-4" />
                  {t("editor.import.opening")}
                </span>
              </div>
            }
          >
            <PlanImportDialog
              open
              onOpenChange={(open) => !open && setImporting(null)}
              floor={plan.floor}
              source={importing === "recrop" && state.doc.underlay ? state.doc.underlay : undefined}
              onImported={onImported}
              north={state.doc.north}
            />
          </React.Suspense>
        )}
        {selectedPlace && (
          <div className="absolute inset-x-4 bottom-16 z-10 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl border bg-popover/95 p-3 shadow-md backdrop-blur">
            <div className="flex min-w-0 flex-col gap-1">
              <PlaceBadge place={{ ...selectedPlace, kind: placeKindForFloor(floorKind) }} />
              {selectedPlace.polygon && (
                <span className="text-xs text-muted-foreground">
                  {formatArea(polygonAreaM2(selectedPlace.polygon), currentLocale())}
                </span>
              )}
            </div>
            {selectedPlace.id && (
              <Button asChild size="sm" variant="secondary">
                <Link to={placeHref(selectedPlace.id)}>
                  <ExternalLinkIcon />
                  {t("editor.place.open")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </FloorPlanCanvas>
    </div>
  );
}
