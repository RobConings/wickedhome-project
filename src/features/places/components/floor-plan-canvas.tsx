import * as React from "react";
import { LayersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ZoomControl } from "@/components/shared/zoom-control";
import { documentContentUrl } from "@/features/documents";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { polygonAreaM2, type FloorUnderlay, type Opening, type Point, type Wall } from "../types/places";
import {
  boundsOf,
  clampOpeningOffset,
  distance,
  faceOffset,
  findWallAt,
  isPointInPolygon,
  midpoint,
  newElementId,
  openingShape,
  polygonCentroid,
  projectOnSegment,
  roundPoint,
  samePoint,
  snapPoint,
  snapValue,
  translate,
  wallLength,
  wallOutline,
} from "./floor-plan-geometry";
import {
  appendChainWall,
  keepOpeningsInWalls,
  updateElement,
  updatePlace,
  updateUnderlay,
  type EditorPlace,
  type PlanDocument,
  type PlanEditorAction,
  type PlanEditorState,
} from "./floor-plan-state";
import { formatArea, formatLength } from "./place-format";
import { PlanCompass } from "./plan-compass";
import { PLAN_MARKER_DRAG_TYPE, PLAN_MARKER_RADIUS, PlanMarkerGlyph, type PlanMarker } from "./plan-markers";
import { rotatePoint, screenAngle } from "./plan-orientation";
import { labelsOnPlan, underlayCorners, underlayTransform } from "./underlay-geometry";

/**
 * screen = turn(world) × scale + offset, where `turn` rotates by the canvas's `rotation` (0 unless the
 * read-only view shows north up). Scale is px per cm, so 1 = 100%.
 */
type View = { scale: number; x: number; y: number };

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
/** Space around the content when fitting, in px (same as the reference editor). */
const FIT_PADDING = 56;
/** A pointer that moves less than this (px) is a tap, not a drag. */
const TAP_SLOP = 4;
/** Snap to an existing corner within this distance (px). */
const POINT_SNAP_PX = 10;
/** Shown when the plan is still empty: 10 × 8 m. */
const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
const toPath = (points: readonly Point[]) => points.map((point) => `${point.x},${point.y}`).join(" ");
const NO_MARKERS: PlanMarker[] = [];
/** Arrow keys move a focused marker by one grid step (Shift: five, Alt: 1 cm); saved after a short pause. */
const NUDGE_KEYS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
const NUDGE_SAVE_DELAY_MS = 500;

type Interaction =
  | { type: "pan"; pointerId: number; startX: number; startY: number; view: View }
  /** Drawing tools: a tap adds a point, a drag pans. Read-only: a tap selects, a drag pans. */
  | { type: "tap"; pointerId: number; startX: number; startY: number; view: View; select?: () => void }
  | { type: "pinch"; startDistance: number; startMid: Point; view: View }
  | {
      type: "drag";
      pointerId: number;
      startX: number;
      startY: number;
      start: Point;
      before: PlanDocument;
      moved: boolean;
      apply: (world: Point, delta: Point, snap: boolean) => PlanDocument;
    }
  /** A marker: a tap clicks it; when markers are movable, a drag moves it. */
  | { type: "marker"; pointerId: number; startX: number; startY: number; view: View; id: string; draggable: boolean; moved: boolean }
  /** Tap-to-place: a tap puts the marker being placed there; a drag pans. */
  | { type: "place"; pointerId: number; startX: number; startY: number; view: View; id: string }
  /** An end of the calibrate tool's measuring line. */
  | { type: "measure"; pointerId: number; end: "a" | "b" };

type FloorPlanCanvasProps = {
  state: PlanEditorState;
  dispatch: React.Dispatch<PlanEditorAction>;
  /** Look around and select only (small screens, children). */
  readOnly?: boolean;
  /** Closes the outline being drawn (clicking its first point, double-click). */
  onCompleteOutline: () => void;
  /** Fill room tool: a click at this plan point (cm). */
  onFill?: (point: Point) => void;
  /** URL of an underlay image (a document); the documents feature's content URL by default. */
  underlayUrl?: (fileId: string) => string;
  /** Markers drawn on top of the plan (devices…). Places knows nothing about what they stand for. */
  markers?: PlanMarker[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** Makes markers draggable (and accepts palette drops); called with the new position in cm. */
  onMarkerMove?: (id: string, x: number, y: number) => void;
  /**
   * Tap-to-place (the alternative to dragging a palette entry, for touch, pen and keyboard): while set, a
   * tap or click on the plan calls `onMarkerMove` for this marker at that spot. Esc calls `onPlacingCancel`.
   */
  placingMarker?: { id: string; label: string } | null;
  onPlacingCancel?: () => void;
  /**
   * Draws the whole plan turned by this many degrees clockwise (the read-only view's "north up"). Labels
   * and markers stay upright; the editor always draws the plan as it is.
   */
  rotation?: number;
  /** The sun's position (from true north), drawn as light coming in from that side and on the compass. */
  sun?: { azimuth: number; elevation: number } | null;
  /** Extra buttons in the row top left (view toggles of the read-only plan). */
  toolbar?: React.ReactNode;
  /** Overlays inside the board, e.g. the tools panel. */
  children?: React.ReactNode;
  className?: string;
};

/**
 * The plan itself: an SVG board with grid, places, walls, doors and windows, handles and labels. Handles
 * pointer input (draw, select, drag, pan, pinch, wheel zoom); the document lives in the editor state.
 * Colours come from the design tokens, so light and dark mode work without extra code.
 */
export function FloorPlanCanvas({
  state,
  dispatch,
  readOnly = false,
  onCompleteOutline,
  onFill,
  underlayUrl = documentContentUrl,
  markers = NO_MARKERS,
  selectedMarkerId,
  onMarkerClick,
  onMarkerMove,
  placingMarker,
  onPlacingCancel,
  rotation: rotationProp = 0,
  sun,
  toolbar,
  children,
  className,
}: FloorPlanCanvasProps) {
  const { t } = useTranslation("places");
  const locale = currentLocale();
  const boardRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [view, setView] = React.useState<View>({ scale: 0.5, x: FIT_PADDING, y: FIT_PADDING });
  const viewRef = React.useRef(view);
  // Turning is for looking only: the editor draws (and hit-tests) the plan as it is.
  const rotation = readOnly ? rotationProp : 0;
  const rotationRef = React.useRef(rotation);
  React.useLayoutEffect(() => {
    viewRef.current = view;
    rotationRef.current = rotation;
  }, [view, rotation]);
  /** The compass dial's drag: the document before it started, so the whole drag is one undo step. */
  const northDragRef = React.useRef<PlanDocument | null>(null);
  // Like the reference editor's auto-fit, the plan follows the board size until the user zooms or pans.
  const autoFitRef = React.useRef(true);
  const interactionRef = React.useRef<Interaction | null>(null);
  const pointersRef = React.useRef(new Map<number, Point>());
  const [hover, setHover] = React.useState<Point | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [spaceDown, setSpaceDown] = React.useState(false);
  /** Where the marker being dragged is now (cm); saved by `onMarkerMove` on release. */
  const [markerDrag, setMarkerDrag] = React.useState<{ id: string; x: number; y: number } | null>(null);
  /** Keyboard nudging: the position so far, saved after a pause or when the marker loses focus. */
  const nudgeRef = React.useRef<{ id: string; x: number; y: number } | null>(null);
  const nudgeTimerRef = React.useRef<number | null>(null);
  /** Tap-to-place: where the marker would land (mouse and pen only). */
  const [placeHover, setPlaceHover] = React.useState<Point | null>(null);

  const { doc, selection, tool, draft } = state;
  const step = doc.gridSize;
  const underlay = doc.underlay;
  // The read-only plan (phones, children, the house view) shows the underlay only on request.
  const [underlayOnRequest, setUnderlayOnRequest] = React.useState(false);
  const underlayShown: FloorUnderlay | null = underlay && (readOnly ? underlayOnRequest : underlay.visible) ? underlay : null;
  const [underlayImage, setUnderlayImage] = React.useState<{ id: string; status: "ready" | "error" } | null>(null);
  const underlayStatus = !underlayShown ? null : underlayImage?.id === underlayShown.imageFileId ? underlayImage.status : "loading";
  const walls = React.useMemo(() => doc.elements.filter((element): element is Wall => element.kind === "wall"), [doc.elements]);
  const wallsById = React.useMemo(() => new Map(walls.map((wall) => [wall.id, wall])), [walls]);
  const openings = doc.elements.filter((element): element is Opening => element.kind !== "wall");
  const drawnPlaces = React.useMemo(
    () =>
      doc.places
        .filter((place): place is EditorPlace & { polygon: Point[] } => Boolean(place.polygon))
        // Small places on top, so a jacuzzi inside the garden stays clickable.
        .sort((a, b) => polygonAreaM2(b.polygon) - polygonAreaM2(a.polygon)),
    [doc.places],
  );

  const contentBounds = React.useCallback(() => {
    const points = [
      ...drawnPlaces.flatMap((place) => place.polygon),
      ...walls.flatMap((wall) => [wall.a, wall.b]),
      ...markers.map(({ x, y }) => ({ x, y })),
      ...(underlayShown ? underlayCorners(underlayShown) : []),
    ];
    // Fitting happens in the turned frame, so a turned plan fills the board too.
    return boundsOf(points.map((point) => rotatePoint(point, rotation))) ?? EMPTY_BOUNDS;
  }, [drawnPlaces, walls, markers, underlayShown, rotation]);

  const fit = React.useCallback(
    (width: number, height: number) => {
      const bounds = contentBounds();
      const contentWidth = Math.max(bounds.maxX - bounds.minX, 100);
      const contentHeight = Math.max(bounds.maxY - bounds.minY, 100);
      const scale = clampScale(
        Math.min((width - FIT_PADDING * 2) / contentWidth, (height - FIT_PADDING * 2) / contentHeight),
      );
      setView({
        scale,
        x: (width - contentWidth * scale) / 2 - bounds.minX * scale,
        y: (height - contentHeight * scale) / 2 - bounds.minY * scale,
      });
    },
    [contentBounds],
  );

  // Only a resize refits; editing never moves the view under the user's pointer.
  const fitRef = React.useRef(fit);
  React.useLayoutEffect(() => {
    fitRef.current = fit;
  }, [fit]);
  React.useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      if (autoFitRef.current) fitRef.current(next.width, next.height);
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  // A newly imported (or newly shown) underlay: fit the view around it once.
  const fittedUnderlay = React.useRef(underlayShown?.imageFileId ?? null);
  React.useEffect(() => {
    const id = underlayShown?.imageFileId ?? null;
    if (id === fittedUnderlay.current) return;
    fittedUnderlay.current = id;
    if (id && size.width > 0) {
      autoFitRef.current = true;
      fitRef.current(size.width, size.height);
    }
  }, [underlayShown?.imageFileId, size.width, size.height]);

  // Turning the plan (north up on/off) fits it again.
  const fittedRotation = React.useRef(rotation);
  React.useEffect(() => {
    if (fittedRotation.current === rotation) return;
    fittedRotation.current = rotation;
    if (size.width > 0) {
      autoFitRef.current = true;
      fitRef.current(size.width, size.height);
    }
  }, [rotation, size.width, size.height]);

  const toWorld = React.useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const current = viewRef.current;
    const turned = {
      x: (clientX - (rect?.left ?? 0) - current.x) / current.scale,
      y: (clientY - (rect?.top ?? 0) - current.y) / current.scale,
    };
    return rotatePoint(turned, -rotationRef.current);
  }, []);

  const toScreen = (point: Point) => {
    const turned = rotatePoint(point, rotation);
    return { x: turned.x * view.scale + view.x, y: turned.y * view.scale + view.y };
  };

  const zoomAt = React.useCallback((factor: number, screenX: number, screenY: number) => {
    autoFitRef.current = false;
    setView((current) => {
      const scale = clampScale(current.scale * factor);
      const ratio = scale / current.scale;
      return { scale, x: screenX - (screenX - current.x) * ratio, y: screenY - (screenY - current.y) * ratio };
    });
  }, []);

  // Wheel zoom around the cursor. Registered by hand: React's wheel listener is passive and can't prevent scrolling.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = svg!.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Hold space to pan with the mouse in any tool.
  React.useEffect(() => {
    const isTyping = (event: KeyboardEvent) => event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event)) {
        event.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (event: KeyboardEvent) => event.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Snapping -----------------------------------------------------------------------------------------------

  /**
   * Grid snap (unless Alt is held), then an existing corner nearby wins. Drawing rooms or face-aligned
   * walls also snaps to the corners of wall faces, where the architect's lines are.
   */
  function snapWorld(world: Point, snap: boolean, exclude?: Point): Point {
    const tolerance = POINT_SNAP_PX / view.scale;
    let best: Point | null = null;
    let bestDistance = tolerance;
    const faces = tool === "outline" || (tool === "wall" && state.wallAlignment !== "center");
    const faceCorners = faces ? walls.flatMap((wall) => wallOutline(wall).map(roundPoint)) : [];
    for (const point of [
      ...drawnPlaces.flatMap((place) => place.polygon),
      ...walls.flatMap((wall) => [wall.a, wall.b]),
      ...faceCorners,
      ...draft,
    ]) {
      if (exclude && samePoint(point, exclude)) continue;
      const d = distance(world, point);
      if (d < bestDistance) {
        best = point;
        bestDistance = d;
      }
    }
    if (best) return best;
    return snap ? snapPoint(world, step) : roundPoint(world);
  }

  // Tool actions -------------------------------------------------------------------------------------------

  function addOpening(world: Point, snap: boolean) {
    if (tool !== "door" && tool !== "window") return;
    const hit = findWallAt(walls, world, 12 / view.scale);
    if (!hit) {
      toast.info(t("editor.hints.openingNeedsWall"));
      return;
    }
    const width = tool === "door" ? state.doorWidth : state.windowWidth;
    const offset = clampOpeningOffset(hit.wall, width, snap ? snapValue(hit.offset, step) : hit.offset);
    if (offset === null) {
      toast.info(t("editor.hints.wallTooShort"));
      return;
    }
    const id = newElementId();
    const opening: Opening =
      tool === "door"
        ? { id, kind: "door", wallId: hit.wall.id, offset, width, hingeAtEnd: false, swingFlipped: false }
        : { id, kind: "window", wallId: hit.wall.id, offset, width };
    dispatch({ type: "commit", doc: { ...doc, elements: [...doc.elements, opening] }, selection: { type: "element", id } });
  }

  function handleTap(clientX: number, clientY: number, snap: boolean) {
    const world = toWorld(clientX, clientY);
    if (tool === "outline") {
      const first = draft[0];
      // Clicking the first point closes the outline.
      if (first && draft.length >= 3 && distance(world, first) * view.scale <= POINT_SNAP_PX) {
        onCompleteOutline();
        return;
      }
      const point = snapWorld(world, snap);
      const last = draft.at(-1);
      if (!last || !samePoint(last, point)) dispatch({ type: "setDraft", draft: [...draft, point] });
    } else if (tool === "wall") {
      const point = snapWorld(world, snap);
      const last = draft.at(-1);
      if (!last) {
        dispatch({ type: "setDraft", draft: [point], chain: [] });
        return;
      }
      if (samePoint(last, point)) return;
      const id = newElementId();
      const next = appendChainWall(doc, {
        draft,
        chain: state.chain,
        point,
        thickness: state.wallThickness,
        alignment: state.wallAlignment,
        id,
      });
      if (next === doc) return;
      dispatch({ type: "commit", doc: next, selection: null });
      // Back at the start of the chain: the outline is closed, stop drawing.
      const closed = draft.length >= 2 && draft[0] && samePoint(draft[0], point);
      dispatch({ type: "setDraft", draft: closed ? [] : [...draft, point], chain: [...state.chain, id] });
    } else if (tool === "door" || tool === "window") {
      addOpening(world, snap);
    } else if (tool === "fill") {
      onFill?.(roundPoint(world));
    } else if (tool === "calibrate") {
      // Measuring needs the exact spot on the underlay: no grid. Two clicks make the line; a third starts over.
      const { a, b } = state.calibration;
      dispatch({ type: "setCalibration", calibration: a && !b ? { a, b: world } : { a: world, b: null } });
    } else if (tool === "north") {
      // The architect's north arrow: tail, then tip (no grid). A third click starts over.
      const { a, b } = state.northArrow;
      dispatch({ type: "setNorthArrow", arrow: a && !b ? { a, b: world } : { a: world, b: null } });
    }
  }

  // Pointer handling ---------------------------------------------------------------------------------------

  function capture(event: React.PointerEvent) {
    try {
      svgRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone (or synthetic); dragging still works while it stays over the board.
    }
  }

  function startPinchIfTwoFingers(): boolean {
    const points = [...pointersRef.current.values()];
    if (points.length !== 2 || !points[0] || !points[1]) return false;
    // A second finger cancels whatever the first one was doing.
    const current = interactionRef.current;
    if (current?.type === "drag" && current.moved) dispatch({ type: "preview", doc: current.before });
    setMarkerDrag(null);
    interactionRef.current = { type: "pinch", startDistance: distance(points[0], points[1]), startMid: midpoint(points[0], points[1]), view: viewRef.current };
    autoFitRef.current = false;
    return true;
  }

  /** Starts dragging part of the plan. `apply` turns the pointer position into the new document. */
  function beginDrag(event: React.PointerEvent, apply: Extract<Interaction, { type: "drag" }>["apply"]) {
    event.stopPropagation();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(event);
    if (startPinchIfTwoFingers()) return;
    interactionRef.current = {
      type: "drag",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: toWorld(event.clientX, event.clientY),
      before: doc,
      moved: false,
      apply,
    };
  }

  /** Select-tool handler for a shape: select it and, when editing, drag it. Other tools let the click through. */
  function shapeHandlers(select: () => void, apply?: Extract<Interaction, { type: "drag" }>["apply"]) {
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (tool !== "select" || event.button !== 0 || spaceDown) return;
        if (readOnly || !apply) {
          event.stopPropagation();
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          capture(event);
          if (startPinchIfTwoFingers()) return;
          interactionRef.current = { type: "tap", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view, select };
          return;
        }
        select();
        beginDrag(event, apply);
      },
    };
  }

  const markersMovable = Boolean(onMarkerMove) && !readOnly;
  const placing = markersMovable && placingMarker ? placingMarker : null;

  // Esc stops placing.
  React.useEffect(() => {
    if (!placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onPlacingCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, onPlacingCancel]);
  // A hover point left over from an earlier placement is harmless: the ghost only renders while placing.

  /** Saves a keyboard nudge (after the pause, on blur). */
  function commitNudge() {
    if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = null;
    const nudge = nudgeRef.current;
    if (!nudge) return;
    nudgeRef.current = null;
    setMarkerDrag(null);
    onMarkerMove?.(nudge.id, nudge.x, nudge.y);
  }
  React.useEffect(
    () => () => {
      if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
    },
    [],
  );

  /** Tap-to-place: claims the pointer before rooms and walls see it, so a tap on a room places too. */
  function onPlacePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!placing || event.button !== 0 || spaceDown) return;
    event.stopPropagation();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(event);
    if (startPinchIfTwoFingers()) return;
    interactionRef.current = { type: "place", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view, id: placing.id };
  }

  /** Keyboard alternative to tapping: puts the marker in the middle of what is visible. */
  function placeInMiddle() {
    if (!placing) return;
    const point = snapPoint(
      rotatePoint({ x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale }, -rotation),
      step,
    );
    onMarkerMove?.(placing.id, point.x, point.y);
  }

  /** Markers react in the select tool: a tap clicks, a drag moves (when movable) or pans. */
  function markerHandlers(id: string) {
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (tool !== "select" || event.button !== 0 || spaceDown) return;
        event.stopPropagation();
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        capture(event);
        if (startPinchIfTwoFingers()) return;
        interactionRef.current = {
          type: "marker",
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          view,
          id,
          draggable: markersMovable,
          moved: false,
        };
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onMarkerClick?.(id);
          return;
        }
        const direction = NUDGE_KEYS[event.key];
        const marker = markers.find((candidate) => candidate.id === id);
        if (!direction || !markersMovable || !marker) return;
        event.preventDefault();
        if (selectedMarkerId !== id) onMarkerClick?.(id);
        const amount = event.altKey ? 1 : event.shiftKey ? step * 5 : step;
        const from = nudgeRef.current?.id === id ? nudgeRef.current : marker;
        const next = { id, x: Math.round(from.x + direction.x * amount), y: Math.round(from.y + direction.y * amount) };
        nudgeRef.current = next;
        setMarkerDrag(next);
        if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = window.setTimeout(commitNudge, NUDGE_SAVE_DELAY_MS);
      },
      onBlur: () => commitNudge(),
    };
  }

  /** Palette entries (see PlanMarkerPaletteItem) can be dropped on the plan. */
  function onDragOver(event: React.DragEvent) {
    if (!markersMovable || !event.dataTransfer.types.includes(PLAN_MARKER_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: React.DragEvent) {
    if (!markersMovable) return;
    const id = event.dataTransfer.getData(PLAN_MARKER_DRAG_TYPE);
    if (!id) return;
    event.preventDefault();
    const world = toWorld(event.clientX, event.clientY);
    const point = event.altKey ? roundPoint(world) : snapPoint(world, step);
    onMarkerMove?.(id, point.x, point.y);
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(event);
    if (startPinchIfTwoFingers()) return;
    if (event.button === 2) return;
    const base = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view };
    if (event.button === 1 || spaceDown) {
      interactionRef.current = { type: "pan", ...base };
      setPanning(true);
    } else if (tool === "select") {
      dispatch({ type: "select", selection: null });
      interactionRef.current = { type: "pan", ...base };
      setPanning(true);
    } else {
      interactionRef.current = { type: "tap", ...base };
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const interaction = interactionRef.current;
    const snap = !event.altKey;

    if (placing && event.pointerType !== "touch") setPlaceHover(toWorld(event.clientX, event.clientY));
    if (tool !== "select" && !readOnly && event.pointerType !== "touch") {
      const world = toWorld(event.clientX, event.clientY);
      setHover(tool === "door" || tool === "window" || tool === "calibrate" || tool === "north" || tool === "fill" ? world : snapWorld(world, snap));
    }
    if (!interaction) return;
    if (interaction.type === "measure") {
      if (interaction.pointerId !== event.pointerId) return;
      dispatch({ type: "setCalibration", calibration: { ...state.calibration, [interaction.end]: toWorld(event.clientX, event.clientY) } });
      return;
    }

    if (interaction.type === "pinch") {
      const points = [...pointersRef.current.values()];
      if (!points[0] || !points[1]) return;
      const rect = svgRef.current?.getBoundingClientRect();
      const mid = midpoint(points[0], points[1]);
      const scale = clampScale(interaction.view.scale * (distance(points[0], points[1]) / interaction.startDistance));
      const ratio = scale / interaction.view.scale;
      const anchor = { x: interaction.startMid.x - (rect?.left ?? 0), y: interaction.startMid.y - (rect?.top ?? 0) };
      setView({
        scale,
        x: anchor.x - (anchor.x - interaction.view.x) * ratio + (mid.x - interaction.startMid.x),
        y: anchor.y - (anchor.y - interaction.view.y) * ratio + (mid.y - interaction.startMid.y),
      });
      return;
    }
    if (interaction.pointerId !== event.pointerId) return;
    const travelled = Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY);

    if (interaction.type === "marker") {
      if (!interaction.draggable) {
        // Not movable: dragging a marker pans the plan, like dragging empty space.
        if (travelled > TAP_SLOP) {
          interactionRef.current = { type: "pan", pointerId: interaction.pointerId, startX: interaction.startX, startY: interaction.startY, view: interaction.view };
          setPanning(true);
        }
        return;
      }
      if (!interaction.moved && travelled <= TAP_SLOP) return;
      interaction.moved = true;
      const world = toWorld(event.clientX, event.clientY);
      setMarkerDrag({ id: interaction.id, ...(snap ? snapPoint(world, step) : roundPoint(world)) });
      return;
    }
    if (interaction.type === "tap" && travelled > TAP_SLOP) {
      // Turned out to be a drag: pan instead.
      interactionRef.current = { ...interaction, type: "pan" };
      setPanning(true);
      return;
    }
    if (interaction.type === "place") {
      if (travelled > TAP_SLOP) {
        interactionRef.current = { type: "pan", pointerId: interaction.pointerId, startX: interaction.startX, startY: interaction.startY, view: interaction.view };
        setPanning(true);
      }
      return;
    }
    if (interaction.type === "pan") {
      autoFitRef.current = false;
      setView({
        ...interaction.view,
        x: interaction.view.x + event.clientX - interaction.startX,
        y: interaction.view.y + event.clientY - interaction.startY,
      });
      return;
    }
    if (interaction.type === "drag") {
      if (!interaction.moved && travelled <= TAP_SLOP) return;
      interaction.moved = true;
      const world = toWorld(event.clientX, event.clientY);
      const delta = { x: world.x - interaction.start.x, y: world.y - interaction.start.y };
      dispatch({ type: "preview", doc: interaction.apply(world, delta, snap) });
    }
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(event.pointerId);
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.type === "pinch") {
      if (pointersRef.current.size === 0) interactionRef.current = null;
      return;
    }
    if (interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setPanning(false);
    if (interaction.type === "measure") return;
    if (interaction.type === "place") {
      if (event.type !== "pointerup") return;
      const world = toWorld(event.clientX, event.clientY);
      const point = event.altKey ? roundPoint(world) : snapPoint(world, step);
      onMarkerMove?.(interaction.id, point.x, point.y);
      return;
    }
    if (interaction.type === "marker") {
      const dragged = interaction.moved ? markerDrag : null;
      setMarkerDrag(null);
      if (event.type !== "pointerup") return;
      if (dragged) onMarkerMove?.(dragged.id, dragged.x, dragged.y);
      else if (!interaction.moved) onMarkerClick?.(interaction.id);
      return;
    }
    if (interaction.type === "tap") {
      if (interaction.select) interaction.select();
      else if (!readOnly && event.type === "pointerup") handleTap(event.clientX, event.clientY, !event.altKey);
    } else if (interaction.type === "drag") {
      // No-op when nothing changed; otherwise one undo step for the whole drag.
      dispatch({ type: "endDrag", before: interaction.before });
    }
  }

  function onDoubleClick() {
    if (readOnly) return;
    if (tool === "outline" && draft.length >= 3) onCompleteOutline();
    if (tool === "wall") dispatch({ type: "setDraft", draft: [] });
  }

  // Drag behaviours ----------------------------------------------------------------------------------------

  const snapDelta = (delta: Point, snap: boolean) => (snap ? snapPoint(delta, step) : roundPoint(delta));

  const movePlace = (place: EditorPlace & { polygon: Point[] }) => (_world: Point, delta: Point, snap: boolean) => {
    const { x, y } = snapDelta(delta, snap);
    return updatePlace(state.doc, place.key, { polygon: place.polygon.map((point) => translate(point, x, y)) });
  };

  const moveVertex = (before: PlanDocument, key: string, polygon: Point[], index: number) => (world: Point, _delta: Point, snap: boolean) => {
    const original = polygon[index];
    const point = snapWorld(world, snap, original);
    return updatePlace(before, key, { polygon: polygon.map((existing, i) => (i === index ? point : existing)) });
  };

  /** Moves wall endpoints that sit on `from` to `to`, so connected walls stay connected. */
  function moveCorner(before: PlanDocument, from: Point, to: Point): PlanDocument {
    const elements = before.elements.map((element) => {
      if (element.kind !== "wall") return element;
      const a = samePoint(element.a, from) ? to : element.a;
      const b = samePoint(element.b, from) ? to : element.b;
      return a === element.a && b === element.b ? element : { ...element, a, b };
    });
    return { ...before, elements: keepOpeningsInWalls(elements) };
  }

  const moveWall = (wall: Wall) => (_world: Point, delta: Point, snap: boolean) => {
    const { x, y } = snapDelta(delta, snap);
    let next = moveCorner(state.doc, wall.a, translate(wall.a, x, y));
    next = moveCorner(next, wall.b, translate(wall.b, x, y));
    return next;
  };

  const moveWallEnd = (wall: Wall, end: "a" | "b") => (world: Point, _delta: Point, snap: boolean) =>
    moveCorner(state.doc, wall[end], snapWorld(world, snap, wall[end]));

  const moveOpening = (opening: Opening, wall: Wall) => (world: Point, _delta: Point, snap: boolean) => {
    const along = projectOnSegment(world, wall.a, wall.b).t * wallLength(wall);
    const offset = clampOpeningOffset(wall, opening.width, snap ? snapValue(along, step) : along);
    return offset === null ? state.doc : updateElement(state.doc, opening.id, { offset });
  };

  /** Aligning the underlay with what is drawn: it moves freely (no grid), one undo step per drag. */
  const moveUnderlay = (start: FloorUnderlay) => (_world: Point, delta: Point) =>
    updateUnderlay(state.doc, { center: { x: start.center.x + delta.x, y: start.center.y + delta.y } });

  /** Starts dragging an end of the measuring line. */
  function beginMeasureDrag(event: React.PointerEvent, end: "a" | "b") {
    event.stopPropagation();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capture(event);
    interactionRef.current = { type: "measure", pointerId: event.pointerId, end };
  }

  // Rendering ----------------------------------------------------------------------------------------------

  const selectedPlace =
    selection?.type === "place" ? drawnPlaces.find((place) => place.key === selection.key) : undefined;
  const selectedElement = selection?.type === "element" ? doc.elements.find((element) => element.id === selection.id) : undefined;
  const editable = !readOnly && tool === "select";
  const outlineColor =
    (state.outlineTarget.type === "existing" &&
      doc.places.find((place) => state.outlineTarget.type === "existing" && place.key === state.outlineTarget.key)?.color) ||
    "var(--primary)";

  const hoverWall = hover && (tool === "door" || tool === "window") ? findWallAt(walls, hover, 12 / view.scale) : null;
  const ghostOpening = (() => {
    if (!hoverWall) return null;
    const width = tool === "door" ? state.doorWidth : state.windowWidth;
    const offset = clampOpeningOffset(hoverWall.wall, width, snapValue(hoverWall.offset, step));
    if (offset === null) return null;
    const opening: Opening =
      tool === "door"
        ? { id: "ghost", kind: "door", wallId: hoverWall.wall.id, offset, width, hingeAtEnd: false, swingFlipped: false }
        : { id: "ghost", kind: "window", wallId: hoverWall.wall.id, offset, width };
    return { wall: hoverWall.wall, opening };
  })();

  const cursor = panning
    ? "cursor-grabbing"
    : spaceDown
      ? "cursor-grab"
      : placing
        ? "cursor-crosshair"
        : tool === "fill" && !readOnly
        ? "cursor-cell"
        : tool !== "select" && !readOnly
          ? "cursor-crosshair"
          : "cursor-default";

  const placeGhost = placing && placeHover ? toScreen(snapPoint(placeHover, step)) : null;
  const underlayMovable = Boolean(underlayShown) && !readOnly && tool === "select" && !underlayShown?.locked;
  // PDF room labels as suggestions, once the scale is right. Labels already inside a drawn room are hidden.
  const labelSuggestions =
    underlayShown?.calibrated && !readOnly
      ? labelsOnPlan(underlayShown).filter((label) => !drawnPlaces.some((place) => isPointInPolygon(label.at, place.polygon)))
      : [];
  const gaps = state.fillFeedback?.type === "open" ? state.fillFeedback.gaps : [];
  const measure = tool === "calibrate" ? state.calibration : null;
  const measureEnd = measure?.a ? (measure.b ?? hover) : null;
  const northArrow = tool === "north" && !readOnly ? state.northArrow : null;
  const northArrowTip = northArrow?.a ? (northArrow.b ?? hover) : null;

  /** The compass dial (editor only): a drag is one undo step, each key press a coalesced commit. */
  function changeNorth(north: number, phase: "move" | "end" | "key") {
    if (phase === "key") {
      dispatch({ type: "commit", doc: { ...doc, north }, coalesce: "north-dial" });
      return;
    }
    const before = northDragRef.current ?? doc;
    northDragRef.current = before;
    // Back where it started: the original document, so ending the drag adds no undo step.
    dispatch({ type: "preview", doc: before.north === north ? before : { ...before, north } });
    if (phase === "end") {
      northDragRef.current = null;
      dispatch({ type: "endDrag", before });
    }
  }
  const sunShown = sun && sun.elevation > 0 && doc.north !== null ? sun : null;
  const faceWall = tool === "wall" && state.wallAlignment !== "center";
  const wallGhost =
    tool === "wall" && draft.length > 0 && hover
      ? (() => {
          const last = draft.at(-1)!;
          const offset = faceOffset(last, hover, state.wallThickness, state.wallAlignment);
          return {
            id: "ghost",
            kind: "wall" as const,
            a: translate(last, offset.x, offset.y),
            b: translate(hover, offset.x, offset.y),
            thickness: state.wallThickness,
          };
        })()
      : null;

  return (
    <div
      ref={boardRef}
      className={cn("relative min-h-[28rem] overflow-hidden rounded-xl border bg-card", className)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        role="application"
        aria-label={t("editor.canvasLabel")}
        width={size.width}
        height={size.height}
        className={cn("absolute inset-0 touch-none select-none", cursor)}
        onPointerDownCapture={placing ? onPlacePointerDown : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          setPlaceHover(null);
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        <PlanGrid view={view} width={size.width} height={size.height} step={step} rotation={rotation} />

        <g transform={`translate(${view.x} ${view.y}) rotate(${rotation}) scale(${view.scale})`}>
          {/* The imported plan sits below everything: rooms, walls and markers are drawn over it. */}
          {underlayShown && (
            <g transform={underlayTransform(underlayShown)} opacity={underlayShown.opacity}>
              <image
                key={underlayShown.imageFileId}
                href={underlayUrl(underlayShown.imageFileId)}
                x={0}
                y={0}
                width={underlayShown.crop.width}
                height={underlayShown.crop.height}
                preserveAspectRatio="none"
                // White paper disappears in light mode; dark mode turns black lines light.
                className={cn(
                  "mix-blend-multiply dark:mix-blend-screen dark:invert",
                  underlayMovable ? "cursor-move" : "pointer-events-none",
                )}
                onLoad={() => setUnderlayImage({ id: underlayShown.imageFileId, status: "ready" })}
                onError={() => setUnderlayImage({ id: underlayShown.imageFileId, status: "error" })}
                // Only reachable when movable: otherwise the image ignores the pointer.
                onPointerDown={(event) => {
                  if (!underlayMovable || event.button !== 0 || spaceDown) return;
                  dispatch({ type: "select", selection: null });
                  beginDrag(event, moveUnderlay(underlayShown));
                }}
              />
            </g>
          )}

          {drawnPlaces.map((place) => {
            const selected = selectedPlace?.key === place.key;
            return (
              <polygon
                key={place.key}
                points={toPath(place.polygon)}
                fill={place.color}
                fillOpacity={selected ? 0.32 : 0.18}
                stroke={place.color}
                strokeWidth={selected ? 4 : 2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={cn(tool === "select" && (editable ? "cursor-move" : "cursor-pointer"))}
                {...shapeHandlers(
                  () => dispatch({ type: "select", selection: { type: "place", key: place.key } }),
                  movePlace(place),
                )}
              />
            );
          })}

          {/* Opacity on the group: the overlapping wall caps at corners must not get darker. */}
          <g opacity={0.85}>
            {walls.map((wall) => (
              <polygon
                key={wall.id}
                points={toPath(wallOutline(wall, { caps: true }))}
                className={cn("fill-foreground", tool === "select" && !readOnly && "cursor-move")}
                {...shapeHandlers(() => dispatch({ type: "select", selection: { type: "element", id: wall.id } }), moveWall(wall))}
              />
            ))}
          </g>

          {openings.map((opening) => {
            const wall = wallsById.get(opening.wallId);
            if (!wall) return null;
            return (
              <OpeningGlyph
                key={opening.id}
                wall={wall}
                opening={opening}
                selected={selectedElement?.id === opening.id}
                className={cn(tool === "select" && !readOnly && "cursor-ew-resize")}
                {...shapeHandlers(
                  () => dispatch({ type: "select", selection: { type: "element", id: opening.id } }),
                  moveOpening(opening, wall),
                )}
              />
            );
          })}

          {selectedElement?.kind === "wall" && (
            <polygon
              points={toPath(wallOutline(selectedElement, { caps: true }))}
              className="pointer-events-none fill-none stroke-primary"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {ghostOpening && (
            <g className="pointer-events-none opacity-60">
              <OpeningGlyph wall={ghostOpening.wall} opening={ghostOpening.opening} selected />
            </g>
          )}

          {tool === "outline" && draft.length > 0 && (
            <g className="pointer-events-none">
              <polyline
                points={toPath(hover ? [...draft, hover] : draft)}
                fill="none"
                stroke={outlineColor}
                strokeWidth={2}
                strokeDasharray="8 6"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {wallGhost && (
            <polygon points={toPath(wallOutline(wallGhost, { caps: true }))} className="pointer-events-none fill-foreground/40" />
          )}
          {/* Face-aligned: the clicked line (the architect's) next to the wall it makes. */}
          {faceWall && draft.length > 0 && (
            <polyline
              points={toPath(hover ? [...draft, hover] : draft)}
              fill="none"
              className="pointer-events-none stroke-primary"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>

        {/* The sun: light coming in from its side of the house (over the plan, under labels and markers). */}
        {sunShown && doc.north !== null && size.width > 0 && (
          <SunLight width={size.width} height={size.height} angle={screenAngle(doc.north, sunShown.azimuth, rotation)} />
        )}

        {/* Screen-space layer: labels and handles keep their size at every zoom level. */}
        <g className="pointer-events-none">
          {drawnPlaces.map((place) => (
            <PlaceLabel
              key={place.key}
              place={place}
              at={toScreen(polygonCentroid(place.polygon))}
              area={formatArea(polygonAreaM2(place.polygon), locale)}
              compact={boundsWidth(place.polygon) * view.scale < 70}
            />
          ))}
          {selectedPlace && <EdgeLengths points={selectedPlace.polygon} closed toScreen={toScreen} locale={locale} />}
          {selectedElement?.kind === "wall" && <EdgeLengths points={[selectedElement.a, selectedElement.b]} toScreen={toScreen} locale={locale} />}
          {tool === "outline" && hover && draft.length > 0 && <EdgeLengths points={[draft.at(-1)!, hover]} toScreen={toScreen} locale={locale} />}
          {tool === "wall" && hover && draft.length > 0 && <EdgeLengths points={[draft.at(-1)!, hover]} toScreen={toScreen} locale={locale} />}
          {labelSuggestions.map((label, index) => (
            <LabelSuggestion
              key={index}
              at={toScreen(label.at)}
              text={[label.name, label.areaM2 !== null ? formatArea(label.areaM2, locale) : null].filter(Boolean).join(" · ")}
            />
          ))}
        </g>

        {/* Where a room leaks: loose wall ends after a failed fill. */}
        {gaps.length > 0 && (
          <g className="pointer-events-none">
            {gaps.map((gap, index) => {
              const at = toScreen(gap);
              return (
                <g key={index}>
                  <circle cx={at.x} cy={at.y} r={14} className="animate-pulse fill-destructive/20 stroke-destructive" strokeWidth={2} />
                  <circle cx={at.x} cy={at.y} r={3} className="fill-destructive" />
                </g>
              );
            })}
          </g>
        )}

        {/* The calibrate tool's measuring line, with its length at the current scale. */}
        {measure?.a && measureEnd && (
          <g>
            <line
              x1={toScreen(measure.a).x}
              y1={toScreen(measure.a).y}
              x2={toScreen(measureEnd).x}
              y2={toScreen(measureEnd).y}
              className="pointer-events-none stroke-warning"
              strokeWidth={2}
              strokeDasharray={measure.b ? undefined : "6 4"}
            />
            <EdgeLengths points={[measure.a, measureEnd]} toScreen={toScreen} locale={locale} />
          </g>
        )}
        {measure && (
          <g>
            {(["a", "b"] as const).map((end) => {
              const point = measure[end];
              if (!point) return null;
              const at = toScreen(point);
              return (
                <g
                  key={end}
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    beginMeasureDrag(event, end);
                  }}
                >
                  <circle cx={at.x} cy={at.y} r={9} className="fill-warning/20 stroke-warning" strokeWidth={2} />
                  <line x1={at.x - 5} x2={at.x + 5} y1={at.y} y2={at.y} className="stroke-warning" strokeWidth={1.5} />
                  <line x1={at.x} x2={at.x} y1={at.y - 5} y2={at.y + 5} className="stroke-warning" strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        )}

        {/* The north tool's arrow, as clicked along the architect's north arrow (tail → tip). */}
        {northArrow?.a && (
          <NorthArrowGlyph tail={toScreen(northArrow.a)} tip={northArrowTip ? toScreen(northArrowTip) : null} done={Boolean(northArrow.b)} />
        )}

        {/* Markers (devices…): screen space, above the plan and below the editing handles. */}
        {markers.length > 0 && (
          <g>
            {markers.map((marker) => {
              const position = markerDrag?.id === marker.id ? markerDrag : marker;
              const interactive = tool === "select" && (markersMovable || Boolean(onMarkerClick));
              return (
                <PlanMarkerGlyph
                  key={marker.id}
                  marker={marker}
                  at={toScreen(position)}
                  selected={selectedMarkerId === marker.id}
                  role={onMarkerClick ? "button" : "img"}
                  aria-label={marker.value ? `${marker.label}, ${marker.value}` : marker.label}
                  tabIndex={onMarkerClick && tool === "select" ? 0 : undefined}
                  className={cn(interactive ? (markersMovable ? "cursor-move" : "cursor-pointer") : "pointer-events-none")}
                  {...markerHandlers(marker.id)}
                />
              );
            })}
          </g>
        )}
        {/* Tap-to-place: where the marker would land (snapped like a drop). */}
        {placeGhost && (
          <circle
            cx={placeGhost.x}
            cy={placeGhost.y}
            r={PLAN_MARKER_RADIUS}
            className="pointer-events-none fill-primary/20 stroke-primary"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}

        {editable && selectedPlace && (
          <g>
            {selectedPlace.polygon.map((point, index) => {
              const next = selectedPlace.polygon[(index + 1) % selectedPlace.polygon.length]!;
              const screenA = toScreen(point);
              const screenB = toScreen(next);
              if (distance(screenA, screenB) < 28) return null;
              const mid = midpoint(screenA, screenB);
              return (
                <circle
                  key={`mid-${index}`}
                  cx={mid.x}
                  cy={mid.y}
                  r={4.5}
                  className="cursor-copy fill-card stroke-muted-foreground"
                  strokeWidth={1.5}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    // Dragging an edge's midpoint inserts a new corner there.
                    const polygon = [...selectedPlace.polygon];
                    polygon.splice(index + 1, 0, roundPoint(midpoint(point, next)));
                    const inserted = updatePlace(doc, selectedPlace.key, { polygon });
                    dispatch({ type: "preview", doc: inserted });
                    dispatch({ type: "select", selection: { type: "place", key: selectedPlace.key, vertex: index + 1 } });
                    // `before` is the document without the new corner: insertion and drag are one undo step.
                    beginDrag(event, moveVertex(inserted, selectedPlace.key, polygon, index + 1));
                  }}
                />
              );
            })}
            {selectedPlace.polygon.map((point, index) => {
              const at = toScreen(point);
              const active = selection?.type === "place" && selection.vertex === index;
              return (
                <circle
                  key={`vertex-${index}`}
                  cx={at.x}
                  cy={at.y}
                  r={active ? 7 : 6}
                  stroke={selectedPlace.color}
                  strokeWidth={3}
                  className={cn("cursor-grab", active ? "fill-warning" : "fill-card")}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    dispatch({ type: "select", selection: { type: "place", key: selectedPlace.key, vertex: index } });
                    beginDrag(event, moveVertex(doc, selectedPlace.key, selectedPlace.polygon, index));
                  }}
                />
              );
            })}
          </g>
        )}

        {editable && selectedElement?.kind === "wall" && (
          <g>
            {(["a", "b"] as const).map((end) => {
              const at = toScreen(selectedElement[end]);
              return (
                <circle
                  key={end}
                  cx={at.x}
                  cy={at.y}
                  r={6}
                  strokeWidth={3}
                  className="cursor-grab fill-card stroke-primary"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    beginDrag(event, moveWallEnd(selectedElement, end));
                  }}
                />
              );
            })}
          </g>
        )}

        {!readOnly && tool !== "select" && (
          <g className="pointer-events-none">
            {draft.map((point, index) => {
              const at = toScreen(point);
              const closable = tool === "outline" && index === 0 && draft.length >= 3;
              return (
                <circle
                  key={index}
                  cx={at.x}
                  cy={at.y}
                  r={closable ? 7 : 5}
                  className={closable ? "fill-card stroke-primary" : "fill-primary"}
                  strokeWidth={closable ? 3 : 0}
                />
              );
            })}
            {hover && (tool === "outline" || tool === "wall") && (
              <circle cx={toScreen(hover).x} cy={toScreen(hover).y} r={4} className="fill-primary/60" />
            )}
          </g>
        )}
      </svg>

      <ZoomControl
        className="absolute bottom-4 left-4 z-10"
        zoom={view.scale * 100}
        canZoomIn={view.scale < MAX_SCALE}
        canZoomOut={view.scale > MIN_SCALE}
        onZoomIn={() => zoomAt(1.25, size.width / 2, size.height / 2)}
        onZoomOut={() => zoomAt(0.8, size.width / 2, size.height / 2)}
        onFit={() => {
          autoFitRef.current = true;
          fit(size.width, size.height);
        }}
        labels={{ zoomIn: t("editor.zoom.in"), zoomOut: t("editor.zoom.out"), fit: t("editor.zoom.fit") }}
      />
      {/* North: a dial in the editor (bottom right, clear of the tools window), a plain rose when looking. */}
      {(!readOnly || doc.north !== null) && (
        <PlanCompass
          north={doc.north}
          viewRotation={rotation}
          sun={sunShown}
          onChange={readOnly ? undefined : changeNorth}
          className={cn("absolute z-10", readOnly ? "top-4 right-4" : "right-4 bottom-4")}
        />
      )}
      {(underlayStatus === "loading" || underlayStatus === "error" || (readOnly && underlay) || toolbar) && (
        <div
          className={cn(
            "absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2",
            readOnly && doc.north !== null ? "max-w-[calc(100%-8rem)]" : "max-w-[calc(100%-2rem)]",
          )}
        >
          {readOnly && underlay && (
            <PlanViewToggle pressed={underlayOnRequest} onPressedChange={setUnderlayOnRequest} icon={LayersIcon}>
              {t("editor.underlay.showInView")}
            </PlanViewToggle>
          )}
          {toolbar}
          {underlayStatus === "loading" && (
            <span role="status" className="inline-flex h-8 items-center gap-2 rounded-full border bg-popover/95 px-3 text-xs text-muted-foreground shadow-sm">
              <Spinner className="size-3.5" />
              {t("editor.underlay.loadingImage")}
            </span>
          )}
          {underlayStatus === "error" && (
            <span role="alert" className="inline-flex h-8 items-center rounded-full border border-destructive/40 bg-popover/95 px-3 text-xs text-destructive shadow-sm">
              {t("editor.underlay.imageFailed")}
            </span>
          )}
        </div>
      )}
      {placing && (
        <div
          role="status"
          className="absolute top-4 left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border bg-popover/95 py-1 pr-1 pl-3 text-sm shadow-md backdrop-blur"
        >
          <span className="min-w-0">{t("editor.markers.placing", { label: placing.label })}</span>
          <Button type="button" size="sm" variant="ghost" onClick={placeInMiddle}>
            {t("editor.markers.placeInMiddle")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onPlacingCancel?.()}>
            {t("editor.markers.cancelPlacing")}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

const boundsWidth = (points: readonly Point[]) => {
  const bounds = boundsOf(points);
  return bounds ? bounds.maxX - bounds.minX : 0;
};

/** A round on/off button for the row top left of a read-only plan (architect's plan, north up, sun). */
export function PlanViewToggle({
  pressed,
  onPressedChange,
  icon: Icon,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border bg-popover/95 px-3 text-sm font-medium shadow-sm backdrop-blur transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        pressed ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * Minor lines every grid step, major lines every metre; drawn in screen space so they stay 1 px. A turned
 * view draws them in the turned frame: screen = R·(world·scale + R⁻¹·offset).
 */
function PlanGrid({ view, width, height, step, rotation = 0 }: { view: View; width: number; height: number; step: number; rotation?: number }) {
  const major = step >= 100 ? 500 : 100;
  const offset = rotatePoint({ x: view.x, y: view.y }, -rotation);
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ].map((corner) => rotatePoint(corner, -rotation));
  const area = boundsOf(corners) ?? { minX: 0, minY: 0, maxX: width, maxY: height };
  // Unturned lines snap to whole pixels so they stay crisp.
  const crisp = (value: number) => (rotation === 0 ? Math.round(value) + 0.5 : value);
  const lines: React.ReactNode[] = [];
  for (const [spacing, className] of [
    [step, "stroke-border"],
    [major, "stroke-muted-foreground/25"],
  ] as const) {
    if (spacing * view.scale < 8) continue;
    const startX = Math.floor((area.minX - offset.x) / view.scale / spacing) * spacing;
    const startY = Math.floor((area.minY - offset.y) / view.scale / spacing) * spacing;
    for (let x = startX; x * view.scale + offset.x <= area.maxX; x += spacing) {
      if (spacing === step && x % major === 0) continue;
      const sx = crisp(x * view.scale + offset.x);
      lines.push(<line key={`x${spacing}-${x}`} x1={sx} x2={sx} y1={area.minY} y2={area.maxY} className={className} />);
    }
    for (let y = startY; y * view.scale + offset.y <= area.maxY; y += spacing) {
      if (spacing === step && y % major === 0) continue;
      const sy = crisp(y * view.scale + offset.y);
      lines.push(<line key={`y${spacing}-${y}`} x1={area.minX} x2={area.maxX} y1={sy} y2={sy} className={className} />);
    }
  }
  return (
    <g className="pointer-events-none" strokeWidth={1} transform={rotation === 0 ? undefined : `rotate(${rotation})`}>
      {lines}
    </g>
  );
}

/**
 * Sunlight from the sun's side of the board: a soft wedge from a sun at the edge towards the middle.
 * `angle` is where the sun is on screen, clockwise from up.
 */
function SunLight({ width, height, angle }: { width: number; height: number; angle: number }) {
  // useId's characters aren't all valid in url(#…): keep the safe ones.
  const id = `sun-light-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const radians = (angle * Math.PI) / 180;
  const centre = { x: width / 2, y: height / 2 };
  const reach = Math.max(Math.min(width, height) / 2 - 40, 40);
  const direction = { x: Math.sin(radians), y: -Math.cos(radians) };
  const sun = { x: centre.x + direction.x * reach, y: centre.y + direction.y * reach };
  const spread = { x: -direction.y * reach * 0.55, y: direction.x * reach * 0.55 };
  return (
    <g className="pointer-events-none" data-accent="energy" aria-hidden="true">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={sun.x} y1={sun.y} x2={centre.x} y2={centre.y}>
          <stop offset="0" style={{ stopColor: "var(--section)", stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: "var(--section)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <polygon
        points={`${sun.x},${sun.y} ${centre.x + spread.x},${centre.y + spread.y} ${centre.x - spread.x},${centre.y - spread.y}`}
        fill={`url(#${id})`}
      />
      {Array.from({ length: 8 }, (_, index) => {
        const ray = (index * Math.PI) / 4;
        return (
          <line
            key={index}
            x1={sun.x + Math.cos(ray) * 13}
            y1={sun.y + Math.sin(ray) * 13}
            x2={sun.x + Math.cos(ray) * 18}
            y2={sun.y + Math.sin(ray) * 18}
            className="stroke-section"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={sun.x} cy={sun.y} r={9} className="fill-section stroke-card" strokeWidth={2} />
    </g>
  );
}

/** The north tool's arrow from tail to tip, in screen space. */
function NorthArrowGlyph({ tail, tip, done }: { tail: Point; tip: Point | null; done: boolean }) {
  const length = tip ? Math.hypot(tip.x - tail.x, tip.y - tail.y) : 0;
  const head =
    tip && length > 12
      ? (() => {
          const ux = (tip.x - tail.x) / length;
          const uy = (tip.y - tail.y) / length;
          const base = { x: tip.x - ux * 14, y: tip.y - uy * 14 };
          return `${tip.x},${tip.y} ${base.x - uy * 7},${base.y + ux * 7} ${base.x + uy * 7},${base.y - ux * 7}`;
        })()
      : null;
  return (
    <g className="pointer-events-none">
      {tip && (
        <line
          x1={tail.x}
          y1={tail.y}
          x2={tip.x}
          y2={tip.y}
          className="stroke-highlight-strong"
          strokeWidth={2.5}
          strokeDasharray={done ? undefined : "6 4"}
        />
      )}
      {head && <polygon points={head} className="fill-highlight-strong" />}
      <circle cx={tail.x} cy={tail.y} r={6} className="fill-card stroke-highlight-strong" strokeWidth={2} />
    </g>
  );
}

type OpeningGlyphProps = React.SVGProps<SVGGElement> & {
  wall: Wall;
  opening: Opening;
  selected?: boolean;
};

/** A door (gap, leaf and swing arc) or window (gap with a double line), in plan coordinates. */
export function OpeningGlyph({ wall, opening, selected, className, ...props }: OpeningGlyphProps) {
  const shape = openingShape(wall, opening);
  const highlight = selected ? "stroke-primary" : "stroke-foreground/80";
  return (
    <g className={className} {...props}>
      <polygon points={toPath(shape.gap)} className={cn("fill-card", selected && "stroke-primary")} strokeWidth={selected ? 2 : 0} vectorEffect="non-scaling-stroke" />
      {opening.kind === "door" ? (
        <>
          <line x1={shape.hinge.x} y1={shape.hinge.y} x2={shape.leafTip.x} y2={shape.leafTip.y} className={highlight} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path
            d={`M ${shape.leafTip.x} ${shape.leafTip.y} A ${opening.width} ${opening.width} 0 0 ${shape.sweep} ${shape.free.x} ${shape.free.y}`}
            fill="none"
            className={selected ? "stroke-primary" : "stroke-muted-foreground"}
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : (
        <>
          {[-1, 1].map((side) => {
            const offset = (wall.thickness / 4) * side;
            return (
              <line
                key={side}
                x1={shape.start.x + shape.normal.x * offset}
                y1={shape.start.y + shape.normal.y * offset}
                x2={shape.end.x + shape.normal.x * offset}
                y2={shape.end.y + shape.normal.y * offset}
                className={selected ? "stroke-primary" : "stroke-info"}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </>
      )}
    </g>
  );
}

function PlaceLabel({ place, at, area, compact }: { place: EditorPlace; at: Point; area: string; compact: boolean }) {
  const name = place.icon ? `${place.icon} ${place.name}` : place.name;
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor="middle"
      className="fill-foreground text-xs font-medium"
      stroke="var(--card)"
      strokeWidth={3}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      <tspan x={at.x} dy={compact ? "0.35em" : "-0.2em"}>
        {compact ? (place.icon ?? place.name.slice(0, 2)) : name}
      </tspan>
      {!compact && (
        <tspan x={at.x} dy="1.3em" className="fill-muted-foreground text-[11px] font-normal">
          {area}
        </tspan>
      )}
    </text>
  );
}

/** A room label found in the imported PDF, offered as a suggestion (dashed, muted). */
function LabelSuggestion({ at, text }: { at: Point; text: string }) {
  if (!text) return null;
  const width = text.length * 6.2 + 14;
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-width / 2} y={-10} width={width} height={20} rx={10} className="fill-card/85 stroke-info" strokeWidth={1} strokeDasharray="3 2" />
      <text textAnchor="middle" dominantBaseline="central" className="fill-info text-[11px] font-medium">
        {text}
      </text>
    </g>
  );
}

/** Length of every edge, just outside it. */
function EdgeLengths({
  points,
  closed = false,
  toScreen,
  locale,
}: {
  points: readonly Point[];
  closed?: boolean;
  toScreen: (point: Point) => Point;
  locale: ReturnType<typeof currentLocale>;
}) {
  const edges = closed ? points.map((point, index) => [point, points[(index + 1) % points.length]!] as const) : [[points[0]!, points[1]!] as const];
  const centre = closed ? toScreen(polygonCentroid(points)) : null;
  return (
    <>
      {edges.map(([a, b], index) => {
        const length = distance(a, b);
        if (length === 0) return null;
        const screenA = toScreen(a);
        const screenB = toScreen(b);
        const screenLength = distance(screenA, screenB);
        if (screenLength < 40) return null;
        const mid = midpoint(screenA, screenB);
        let normal = { x: -(screenB.y - screenA.y) / screenLength, y: (screenB.x - screenA.x) / screenLength };
        // Labels go on the outside of a shape, clear of its edge and the midpoint handle.
        if (centre && normal.x * (centre.x - mid.x) + normal.y * (centre.y - mid.y) > 0) normal = { x: -normal.x, y: -normal.y };
        const anchor = normal.x > 0.5 ? "start" : normal.x < -0.5 ? "end" : "middle";
        return (
          <text
            key={index}
            x={mid.x + normal.x * 12}
            y={mid.y + normal.y * 12}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {formatLength(length, locale)}
          </text>
        );
      })}
    </>
  );
}
