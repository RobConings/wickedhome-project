import type { FloorPlan, FloorPlanInput, FloorUnderlay, PlanElement, Point, Wall } from "../types/places";
import { faceOffset, keepOpeningsInWalls as keepOpeningsInWallElements, mitreCorner, roundPoint, samePoint, translate, withoutElement } from "./floor-plan-geometry";
import { DEFAULT_GAP_TOLERANCE } from "./room-from-walls";

// Editor state: the document being edited, undo/redo history and what the user is doing right now.
// The document is replaced (never mutated), so history entries and the saved state compare by reference.

/** Tools in the tools window's switch. */
export const PLAN_TOOLS = ["select", "outline", "fill", "wall", "door", "window"] as const;
export type SwitchTool = (typeof PLAN_TOOLS)[number];
/**
 * `calibrate` (measuring the underlay) is opened from the underlay section and `north` (clicking the
 * architect's north arrow) from the orientation section, not from the switch.
 */
export type PlanTool = SwitchTool | "calibrate" | "north";

/** Keyboard shortcut per tool, handled by the editor and listed in the tools window. */
export const TOOL_KEYS: Record<SwitchTool, string> = { select: "V", outline: "R", fill: "F", wall: "W", door: "D", window: "N" };

/**
 * Where the clicked line sits on the wall: its centre line, or one of its faces (seen in the drawing
 * direction), so clicking along the architect's line gives the right wall.
 */
export const WALL_ALIGNMENTS = ["center", "left", "right"] as const;
export type WallAlignment = (typeof WALL_ALIGNMENTS)[number];

/** A place as the editor holds it. `key` is the place id, or a temporary key for places drawn here. */
export type EditorPlace = {
  key: string;
  id?: string;
  name: string;
  color: string;
  icon: string | null;
  polygon: Point[] | null;
};

export type PlanDocument = {
  gridSize: number;
  places: EditorPlace[];
  elements: PlanElement[];
  /** The imported plan under the drawing (settings only; the image is a document). */
  underlay: FloorUnderlay | null;
  /** Where true north is on the plan (degrees clockwise from up), or null. The household's, saved with the plan. */
  north: number | null;
};

export type PlanSelection =
  | { type: "place"; key: string; vertex?: number }
  | { type: "element"; id: string }
  | null;

/** Draw the next outline for an existing place, or for a new one. */
export type OutlineTarget = { type: "existing"; key: string } | { type: "new" };

/** What the last "Fill room" click did, shown in the tools window and on the plan. */
export type FillFeedback =
  | { type: "filled"; key: string; areaM2: number; planAreaM2: number | null; reused: boolean }
  | { type: "existing"; key: string }
  | { type: "open"; gaps: Point[] }
  | { type: "on-wall" }
  | { type: "no-walls" };

export type PlanEditorState = {
  doc: PlanDocument;
  /** The last saved document; the editor is dirty when `doc` is anything else. */
  saved: PlanDocument;
  past: PlanDocument[];
  future: PlanDocument[];
  tool: PlanTool;
  selection: PlanSelection;
  /** Points of the outline or wall chain being drawn (for face-aligned walls: the clicked face line). */
  draft: Point[];
  /** Ids of the walls drawn in the current chain, so face-aligned corners can be mitred. */
  chain: string[];
  outlineTarget: OutlineTarget;
  wallThickness: number;
  wallAlignment: WallAlignment;
  doorWidth: number;
  windowWidth: number;
  /** Fill room: gaps up to this many cm between walls are closed. */
  gapTolerance: number;
  fillFeedback: FillFeedback | null;
  /** The measuring line of the calibrate tool, in plan cm. */
  calibration: { a: Point | null; b: Point | null };
  /** The north tool's arrow (tail → tip) as clicked on the plan, in plan cm. */
  northArrow: { a: Point | null; b: Point | null };
  /** `coalesce` key of the last commit, so consecutive keystrokes share one undo step. */
  lastCoalesce?: string;
};

type NumberOption = "wallThickness" | "doorWidth" | "windowWidth" | "gapTolerance";

export type PlanEditorAction =
  | { type: "setTool"; tool: PlanTool; outlineTarget?: OutlineTarget }
  | { type: "select"; selection: PlanSelection }
  | { type: "setOutlineTarget"; target: OutlineTarget }
  /**
   * A finished change: becomes one undo step. Commits with the same `coalesce` key in a row (typing a
   * name, a slider) are merged into one step.
   */
  | { type: "commit"; doc: PlanDocument; selection?: PlanSelection; coalesce?: string }
  /** A change while dragging. `before` is the document when the drag started; commit it with `endDrag`. */
  | { type: "preview"; doc: PlanDocument }
  | { type: "endDrag"; before: PlanDocument }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "setDraft"; draft: Point[]; chain?: string[] }
  /** Closes the outline being drawn. `newPlace` is used when the target is a new place. */
  | { type: "completeOutline"; newPlace: { key: string; name: string; color: string } }
  | { type: "setOption"; option: NumberOption; value: number }
  | { type: "setWallAlignment"; alignment: WallAlignment }
  | { type: "setFillFeedback"; feedback: FillFeedback | null }
  | { type: "setCalibration"; calibration: PlanEditorState["calibration"] }
  | { type: "setNorthArrow"; arrow: PlanEditorState["northArrow"] }
  | { type: "loaded"; plan: FloorPlan }
  /** Saved without a fresh plan from the server (e.g. in Storybook). */
  | { type: "markSaved" };

const HISTORY_LIMIT = 100;
const NO_CALIBRATION = { a: null, b: null };

export const toPlanDocument = (plan: FloorPlan): PlanDocument => ({
  gridSize: plan.floor.gridSize,
  places: plan.places.map((place) => ({
    key: place.id,
    id: place.id,
    name: place.name,
    color: place.color,
    icon: place.icon,
    polygon: place.polygon,
  })),
  elements: plan.elements,
  underlay: plan.underlay ?? null,
  north: plan.north ?? null,
});

/** What the API saves: every place the editor knows, all elements, the underlay and north. */
export const toPlanInput = (doc: PlanDocument): FloorPlanInput => ({
  gridSize: doc.gridSize as FloorPlanInput["gridSize"],
  places: doc.places.map(({ id, name, color, icon, polygon }) => ({ id, name: name.trim(), color, icon, polygon })),
  elements: doc.elements,
  underlay: doc.underlay,
  north: doc.north,
});

export function initPlanEditor(plan: FloorPlan): PlanEditorState {
  const doc = toPlanDocument(plan);
  return {
    doc,
    saved: doc,
    past: [],
    future: [],
    tool: "select",
    selection: null,
    draft: [],
    chain: [],
    outlineTarget: { type: "new" },
    wallThickness: plan.floor.kind === "outdoor" ? 20 : 14,
    wallAlignment: "center",
    doorWidth: 90,
    windowWidth: 120,
    gapTolerance: DEFAULT_GAP_TOLERANCE,
    fillFeedback: null,
    calibration: NO_CALIBRATION,
    northArrow: NO_CALIBRATION,
  };
}

const withHistory = (state: PlanEditorState, before: PlanDocument, doc: PlanDocument): PlanEditorState => ({
  ...state,
  doc,
  past: [...state.past, before].slice(-HISTORY_LIMIT),
  future: [],
  lastCoalesce: undefined,
});

/** Drops a selection that no longer points at anything (after undo, redo or a delete). */
function validSelection(doc: PlanDocument, selection: PlanSelection): PlanSelection {
  if (!selection) return null;
  if (selection.type === "element") return doc.elements.some((element) => element.id === selection.id) ? selection : null;
  const place = doc.places.find((candidate) => candidate.key === selection.key);
  if (!place?.polygon) return null;
  return selection.vertex !== undefined && selection.vertex >= place.polygon.length ? { ...selection, vertex: undefined } : selection;
}

export function planEditorReducer(state: PlanEditorState, action: PlanEditorAction): PlanEditorState {
  switch (action.type) {
    case "setTool": {
      // Like the reference editor, an unfinished outline survives a tool switch; a wall chain does not.
      const clearDraft = state.tool === "wall" || action.tool === "wall";
      return {
        ...state,
        tool: action.tool,
        outlineTarget: action.outlineTarget ?? state.outlineTarget,
        draft: clearDraft ? [] : state.draft,
        chain: clearDraft ? [] : state.chain,
        selection: action.tool === "select" ? state.selection : null,
        fillFeedback: action.tool === state.tool ? state.fillFeedback : null,
        calibration: action.tool === "calibrate" ? state.calibration : NO_CALIBRATION,
        northArrow: action.tool === "north" ? state.northArrow : NO_CALIBRATION,
      };
    }
    case "select":
      return { ...state, selection: action.selection, lastCoalesce: undefined };
    case "setOutlineTarget":
      return { ...state, outlineTarget: action.target };
    case "commit": {
      const merge = action.coalesce !== undefined && action.coalesce === state.lastCoalesce;
      const next = merge ? { ...state, doc: action.doc } : withHistory(state, state.doc, action.doc);
      return {
        ...next,
        lastCoalesce: action.coalesce,
        selection: validSelection(action.doc, action.selection !== undefined ? action.selection : state.selection),
      };
    }
    case "preview":
      return { ...state, doc: action.doc };
    case "endDrag":
      return action.before === state.doc ? state : withHistory(state, action.before, state.doc);
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        lastCoalesce: undefined,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selection: validSelection(previous, state.selection),
      };
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return {
        ...state,
        lastCoalesce: undefined,
        doc: next,
        past: [...state.past, state.doc],
        future,
        selection: validSelection(next, state.selection),
      };
    }
    case "setDraft":
      return { ...state, draft: action.draft, chain: action.draft.length === 0 ? [] : (action.chain ?? state.chain) };
    case "completeOutline": {
      if (state.draft.length < 3) return state;
      const polygon = state.draft;
      const target = state.outlineTarget;
      const existing = target.type === "existing" && state.doc.places.some((place) => place.key === target.key);
      const key = existing ? target.key : action.newPlace.key;
      const doc = existing
        ? updatePlace(state.doc, key, { polygon })
        : { ...state.doc, places: [...state.doc.places, { ...action.newPlace, icon: null, polygon }] };
      // As in the reference editor: the new shape is selected and the select tool takes over.
      return {
        ...withHistory(state, state.doc, doc),
        draft: [],
        chain: [],
        tool: "select",
        selection: { type: "place", key },
        outlineTarget: { type: "new" },
      };
    }
    case "setOption":
      return { ...state, [action.option]: action.value };
    case "setWallAlignment":
      return { ...state, wallAlignment: action.alignment };
    case "setFillFeedback":
      return { ...state, fillFeedback: action.feedback };
    case "setCalibration":
      return { ...state, calibration: action.calibration };
    case "setNorthArrow":
      return { ...state, northArrow: action.arrow };
    case "markSaved":
      return { ...state, saved: state.doc };
    case "loaded": {
      const doc = toPlanDocument(action.plan);
      return { ...state, doc, saved: doc, past: [], future: [], selection: null, draft: [], chain: [], fillFeedback: null };
    }
  }
}

// Document edits ------------------------------------------------------------------------------------------

export const updatePlace = (doc: PlanDocument, key: string, change: Partial<EditorPlace>): PlanDocument => ({
  ...doc,
  places: doc.places.map((place) => (place.key === key ? { ...place, ...change } : place)),
});

export const updateElement = (doc: PlanDocument, id: string, change: Partial<PlanElement>): PlanDocument => ({
  ...doc,
  elements: doc.elements.map((element) => (element.id === id ? ({ ...element, ...change } as PlanElement) : element)),
});

/** Changes the underlay's settings (no-op without one). */
export const updateUnderlay = (doc: PlanDocument, change: Partial<FloorUnderlay>): PlanDocument =>
  doc.underlay ? { ...doc, underlay: { ...doc.underlay, ...change } } : doc;

/** After walls move, doors and windows slide back inside their (possibly shorter) wall. */
export const keepOpeningsInWalls = (elements: PlanDocument["elements"]): PlanDocument["elements"] => keepOpeningsInWallElements(elements);

/**
 * Adds the next wall of a chain, from the last clicked point to `point`. Centre-aligned walls follow the
 * clicks. Face-aligned walls sit beside the clicked line, so at every corner the previous wall's end and
 * the new wall's start move to where their centre lines meet (and the first wall when the chain closes).
 */
export function appendChainWall(
  doc: PlanDocument,
  options: { draft: Point[]; chain: string[]; point: Point; thickness: number; alignment: WallAlignment; id: string },
): PlanDocument {
  const { draft, chain, point, thickness, alignment, id } = options;
  const last = draft.at(-1);
  if (!last) return doc;
  if (alignment === "center") {
    const wall: Wall = { id, kind: "wall", a: last, b: point, thickness };
    return { ...doc, elements: [...doc.elements, wall] };
  }
  const findWall = (wallId: string | undefined) =>
    doc.elements.find((element): element is Wall => element.kind === "wall" && element.id === wallId);
  const offset = faceOffset(last, point, thickness, alignment);
  const previousFace = draft.at(-2);
  const previous = findWall(chain.at(-1));
  let a = previous && previousFace ? mitreCorner(previousFace, last, point, previous.thickness, thickness, alignment) : translate(last, offset.x, offset.y);
  let b = translate(point, offset.x, offset.y);
  a = roundPoint(a);
  let elements = doc.elements.map((element) => (previous && previousFace && element.id === previous.id ? { ...previous, b: a } : element));

  const closes = draft.length >= 2 && draft[0] !== undefined && samePoint(draft[0], point);
  const first = findWall(chain[0]);
  const secondFace = draft[1];
  if (closes && first && secondFace && first.id !== previous?.id) {
    b = roundPoint(mitreCorner(last, point, secondFace, thickness, first.thickness, alignment));
    elements = elements.map((element) => (element.id === first.id && element.kind === "wall" ? { ...element, a: b } : element));
  }
  const wall: Wall = { id, kind: "wall", a, b: roundPoint(b), thickness };
  if (samePoint(wall.a, wall.b)) return doc;
  return { ...doc, elements: keepOpeningsInWalls([...elements, wall]) };
}

/** Removes an element; removing a wall also removes the doors and windows in it. */
export const removeElement = (doc: PlanDocument, id: string): PlanDocument => ({ ...doc, elements: withoutElement(doc.elements, id) });

/**
 * Removes a place's outline. A place drawn in this session (not saved yet) disappears entirely; a saved
 * place keeps existing, because places are data first and the drawing is only a view on them.
 */
export const removeOutline = (doc: PlanDocument, key: string): PlanDocument => ({
  ...doc,
  places: doc.places.flatMap((place) => {
    if (place.key !== key) return [place];
    return place.id ? [{ ...place, polygon: null }] : [];
  }),
});
