import * as React from "react";
import {
  AppWindowIcon,
  BrickWallIcon,
  CheckIcon,
  DoorOpenIcon,
  EraserIcon,
  ExternalLinkIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  MousePointer2Icon,
  PaintBucketIcon,
  PencilRulerIcon,
  Trash2Icon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorSwatchPicker } from "./color-swatch-picker";
import { FloatingPanel } from "./floating-panel";
import { SegmentedControl } from "./segmented-control";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GRID_SIZES, PLACE_COLORS, polygonAreaM2, type FloorKind, type PlanElement } from "../types/places";
import { wallLength } from "./floor-plan-geometry";
import {
  PLAN_TOOLS,
  TOOL_KEYS,
  WALL_ALIGNMENTS,
  removeElement,
  removeOutline,
  updateElement,
  updatePlace,
  type EditorPlace,
  type PlanEditorAction,
  type PlanEditorState,
  type SwitchTool,
} from "./floor-plan-state";
import { NorthToolContext, OrientationSection } from "./floor-plan-orientation-panel";
import { AreaCheck, CalibrateToolContext, UnderlaySection } from "./floor-plan-underlay-panel";
import { formatArea, formatLength } from "./place-format";
import { GAP_TOLERANCES } from "./room-from-walls";
import { labelInside } from "./underlay-geometry";

const TOOL_ICONS: Record<SwitchTool, LucideIcon> = {
  select: MousePointer2Icon,
  outline: PencilRulerIcon,
  fill: PaintBucketIcon,
  wall: BrickWallIcon,
  door: DoorOpenIcon,
  window: AppWindowIcon,
};

/** Common Belgian wall thicknesses (cm): partition 9, inner 14, 20, cavity walls 30 and 34. */
const WALL_PRESETS = [9, 14, 20, 30, 34];
const WALL_THICKNESSES = [5, 9, 10, 14, 15, 20, 25, 30, 34, 40];
const DOOR_WIDTHS = [60, 70, 80, 90, 100, 120, 150, 180];
const WINDOW_WIDTHS = [40, 60, 80, 100, 120, 150, 180, 200, 250, 300];

type FloorPlanToolsPanelProps = {
  state: PlanEditorState;
  dispatch: React.Dispatch<PlanEditorAction>;
  floorKind: FloorKind;
  onCompleteOutline: () => void;
  /** Link to a saved place's detail page. */
  placeHref: (id: string) => string;
  /** Opens the plan import (a new file). */
  onImport?: () => void;
  /** Opens the plan import to redo the crop of the current underlay. */
  onRecrop?: () => void;
};

/**
 * The tools window: a floating, draggable, collapsible panel over the plan (as in the reference editor).
 * Top to bottom: window controls, the tool switch, what the active tool or the selection needs, then the
 * imported plan (underlay).
 */
export function FloorPlanToolsPanel(props: FloorPlanToolsPanelProps) {
  const { state, dispatch, floorKind, onCompleteOutline, placeHref, onImport, onRecrop } = props;
  const { t } = useTranslation("places");

  return (
    <FloatingPanel
      label={t("editor.panel.label")}
      moveLabel={t("editor.panel.move")}
      resetLabel={t("editor.panel.reset")}
      compactLabel={t("editor.panel.compact")}
      expandLabel={t("editor.panel.expand")}
      storageKey="wh-floor-plan-panel"
    >
      {(compact) => {
        const detail = compact ? "sr-only" : undefined;
        return (
          <>
            <div
              role="group"
              aria-label={t("editor.panel.tools")}
              className={cn("grid gap-1 rounded-lg border bg-muted p-1", compact ? "grid-cols-3" : "grid-cols-6")}
            >
              {PLAN_TOOLS.map((tool) => {
                const Icon = TOOL_ICONS[tool];
                const label = t(`editor.tools.${tool === "outline" ? floorKind : tool}`);
                const active = state.tool === tool;
                return (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={active}
                    title={`${label} (${TOOL_KEYS[tool]})`}
                    onClick={() => dispatch({ type: "setTool", tool })}
                    className={cn(
                      "inline-flex flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium text-muted-foreground transition-colors outline-none hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      compact ? "h-9" : "h-12",
                      active && "bg-card text-foreground shadow-sm",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className={cn("max-w-full truncate px-0.5", detail)}>{label}</span>
                  </button>
                );
              })}
            </div>

            <ToolContext
              state={state}
              dispatch={dispatch}
              floorKind={floorKind}
              onCompleteOutline={onCompleteOutline}
              placeHref={placeHref}
              detail={detail}
            />

            {!compact && onImport && onRecrop && state.tool !== "calibrate" && state.tool !== "north" && (
              <UnderlaySection state={state} dispatch={dispatch} onImport={onImport} onRecrop={onRecrop} />
            )}

            {!compact && state.tool !== "calibrate" && state.tool !== "north" && <OrientationSection state={state} dispatch={dispatch} />}

            {!compact && (
              <p className="border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">{t("editor.panel.shortcuts")}</p>
            )}
          </>
        );
      }}
    </FloatingPanel>
  );
}

type ContextProps = FloorPlanToolsPanelProps & { detail?: string };

function ToolContext(props: ContextProps) {
  const { state } = props;
  if (state.tool === "outline") return <OutlineToolContext {...props} />;
  if (state.tool === "fill") return <FillToolContext {...props} />;
  if (state.tool === "calibrate") return <CalibrateToolContext state={state} dispatch={props.dispatch} detail={props.detail} />;
  if (state.tool === "north") return <NorthToolContext state={state} dispatch={props.dispatch} detail={props.detail} />;
  if (state.tool === "wall") return <WallToolContext {...props} />;
  if (state.tool === "door" || state.tool === "window") return <OpeningToolContext {...props} />;

  const selection = state.selection;
  if (selection?.type === "place") {
    const place = state.doc.places.find((candidate) => candidate.key === selection.key);
    if (place?.polygon) return <PlaceProperties {...props} place={place} polygon={place.polygon} vertex={selection.vertex} />;
  }
  if (selection?.type === "element") {
    const element = state.doc.elements.find((candidate) => candidate.id === selection.id);
    if (element) return <ElementProperties {...props} element={element} />;
  }
  return <NothingSelected {...props} />;
}

function Hint({ title, children, detail }: { title?: React.ReactNode; children?: React.ReactNode; detail?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", detail)}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      {children && <p className="text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}

function OutlineToolContext({ state, dispatch, floorKind, onCompleteOutline, detail }: ContextProps) {
  const { t } = useTranslation("places");
  const unplaced = state.doc.places.filter((place) => !place.polygon);
  const target = state.outlineTarget.type === "existing" ? state.outlineTarget.key : "new";
  const missing = Math.max(3 - state.draft.length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-outline-target" className={cn("text-xs", detail)}>
          {t("editor.outline.target")}
        </Label>
        <Select
          value={target}
          onValueChange={(value) =>
            dispatch({ type: "setOutlineTarget", target: value === "new" ? { type: "new" } : { type: "existing", key: value } })
          }
        >
          <SelectTrigger id="plan-outline-target" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">{t(`editor.outline.new.${floorKind}`)}</SelectItem>
            {unplaced.map((place) => (
              <SelectItem key={place.key} value={place.key}>
                {place.icon ? `${place.icon} ${place.name}` : place.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Hint detail={detail} title={missing > 0 ? t("editor.outline.missing", { count: missing }) : t("editor.outline.ready", { count: state.draft.length })}>
        {t("editor.hints.outline")}
      </Hint>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onCompleteOutline} disabled={state.draft.length < 3} title={t("editor.outline.complete")}>
          <CheckIcon />
          <span className={detail}>{t("editor.outline.complete")}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => dispatch({ type: "setDraft", draft: state.draft.slice(0, -1) })}
          disabled={state.draft.length === 0}
          title={t("editor.outline.undoPoint")}
        >
          <Undo2Icon />
          <span className={detail}>{t("editor.outline.undoPoint")}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => dispatch({ type: "setDraft", draft: [] })}
          disabled={state.draft.length === 0}
          title={t("editor.outline.clear")}
        >
          <EraserIcon />
          <span className={detail}>{t("editor.outline.clear")}</span>
        </Button>
      </div>
    </div>
  );
}

function SizeSelect({
  id,
  label,
  value,
  options,
  onChange,
  detail,
}: {
  id: string;
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  detail?: string;
}) {
  const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn("text-xs", detail)}>
        {label}
      </Label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option} cm
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WallToolContext({ state, dispatch, detail }: ContextProps) {
  const { t } = useTranslation("places");
  const [custom, setCustom] = React.useState(WALL_PRESETS.includes(state.wallThickness) ? "" : String(state.wallThickness));
  const setThickness = (value: number) => dispatch({ type: "setOption", option: "wallThickness", value });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span id="plan-wall-thickness" className={cn("text-xs font-medium", detail)}>
          {t("editor.fields.thickness")}
        </span>
        <div role="group" aria-labelledby="plan-wall-thickness" className="flex flex-wrap items-center gap-1">
          {WALL_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="xs"
              variant={state.wallThickness === preset ? "default" : "outline"}
              aria-pressed={state.wallThickness === preset}
              onClick={() => {
                setCustom("");
                setThickness(preset);
              }}
            >
              {preset}
            </Button>
          ))}
          <Input
            aria-label={t("editor.wall.customThickness")}
            className="h-6 w-16 px-2 text-xs"
            type="number"
            inputMode="numeric"
            min={2}
            max={100}
            placeholder={t("editor.wall.custom")}
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 2 && value <= 100) setThickness(value);
            }}
          />
          <span className="text-xs text-muted-foreground">cm</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={cn("text-xs font-medium", detail)}>{t("editor.wall.alignment")}</span>
        <SegmentedControl
          label={t("editor.wall.alignment")}
          size="sm"
          options={WALL_ALIGNMENTS.map((value) => ({ value, label: t(`editor.wall.align.${value}`) }))}
          value={state.wallAlignment}
          onChange={(alignment) => dispatch({ type: "setWallAlignment", alignment })}
        />
      </div>
      <Hint detail={detail} title={state.draft.length > 0 ? t("editor.wall.drawing") : t("editor.wall.start")}>
        {state.wallAlignment === "center" ? t("editor.hints.wall") : t("editor.hints.wallFace")}
      </Hint>
      {state.draft.length > 0 && (
        <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: "setDraft", draft: [] })} title={t("editor.wall.finish")}>
          <CheckIcon />
          <span className={detail}>{t("editor.wall.finish")}</span>
        </Button>
      )}
    </div>
  );
}

/** Fill room: click inside walls. Shows what the last click did (with the architect's area check). */
function FillToolContext({ state, dispatch, detail }: ContextProps) {
  const { t } = useTranslation("places");
  const feedback = state.fillFeedback;
  const place = feedback && (feedback.type === "filled" || feedback.type === "existing") ? state.doc.places.find((candidate) => candidate.key === feedback.key) : undefined;
  const hasLabels = Boolean(state.doc.underlay?.calibrated && state.doc.underlay.labels.length > 0);
  const openPlace = () => {
    if (!place) return;
    dispatch({ type: "setTool", tool: "select" });
    dispatch({ type: "select", selection: { type: "place", key: place.key } });
  };

  return (
    <div className="flex flex-col gap-3">
      <Hint detail={detail} title={t("editor.fill.title")}>
        {t("editor.hints.fill")}
        {hasLabels && ` ${t("editor.fill.labels")}`}
      </Hint>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-gap-tolerance" className={cn("text-xs", detail)}>
          {t("editor.fill.gapTolerance")}
        </Label>
        <Select value={String(state.gapTolerance)} onValueChange={(value) => dispatch({ type: "setOption", option: "gapTolerance", value: Number(value) })}>
          <SelectTrigger id="plan-gap-tolerance" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAP_TOLERANCES.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value === 0 ? t("editor.fill.noGaps") : `${value} cm`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {feedback && (
        <div
          aria-live="polite"
          className={cn(
            "flex flex-col gap-2 rounded-lg border p-2.5 text-sm",
            feedback.type === "filled" || feedback.type === "existing" ? "bg-muted/60" : "border-destructive/30 bg-destructive/10",
          )}
        >
          {feedback.type === "filled" && place && (
            <>
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: place.color }} aria-hidden="true" />
                {feedback.reused ? t("editor.fill.reused", { name: place.name }) : t("editor.fill.filled", { name: place.name })}
              </p>
              <AreaCheck areaM2={feedback.areaM2} planAreaM2={feedback.planAreaM2} />
            </>
          )}
          {feedback.type === "existing" && place && <p>{t("editor.fill.existing", { name: place.name })}</p>}
          {feedback.type === "open" && (
            <p>{feedback.gaps.length > 0 ? t("editor.fill.open", { count: feedback.gaps.length }) : t("editor.fill.outside")}</p>
          )}
          {feedback.type === "on-wall" && <p>{t("editor.fill.onWall")}</p>}
          {feedback.type === "no-walls" && <p>{t("editor.fill.noWalls")}</p>}
          {place && (
            <Button type="button" size="xs" variant="secondary" className="self-start" onClick={openPlace}>
              <PencilRulerIcon />
              {t("editor.fill.edit")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function OpeningToolContext({ state, dispatch, detail }: ContextProps) {
  const { t } = useTranslation("places");
  const door = state.tool === "door";
  return (
    <div className="flex flex-col gap-3">
      <SizeSelect
        id="plan-opening-width"
        label={t("editor.fields.width")}
        value={door ? state.doorWidth : state.windowWidth}
        options={door ? DOOR_WIDTHS : WINDOW_WIDTHS}
        onChange={(value) => dispatch({ type: "setOption", option: door ? "doorWidth" : "windowWidth", value })}
        detail={detail}
      />
      <Hint detail={detail}>{door ? t("editor.hints.door") : t("editor.hints.window")}</Hint>
    </div>
  );
}

function PlaceProperties({
  state,
  dispatch,
  placeHref,
  detail,
  place,
  polygon,
  vertex,
}: ContextProps & { place: EditorPlace; polygon: NonNullable<EditorPlace["polygon"]>; vertex?: number }) {
  const { t } = useTranslation("places");
  const change = (patch: Partial<EditorPlace>, coalesce?: string) =>
    dispatch({ type: "commit", doc: updatePlace(state.doc, place.key, patch), coalesce });
  // The architect's label inside this room, to check the drawn area against.
  const planLabel = labelInside(state.doc.underlay, polygon);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-place-icon" className={cn("text-xs", detail)}>
            {t("fields.icon")}
          </Label>
          {/* Live: the plan label follows while typing, and one edit is one undo step. */}
          <Input
            id="plan-place-icon"
            className="h-8 text-center"
            maxLength={8}
            placeholder="🛋️"
            value={place.icon ?? ""}
            onChange={(event) => change({ icon: event.target.value.trim() || null }, `icon-${place.key}`)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-place-name" className={cn("text-xs", detail)}>
            {t("fields.name")}
          </Label>
          <Input
            id="plan-place-name"
            className="h-8"
            maxLength={60}
            required
            aria-invalid={place.name.trim() === "" || undefined}
            value={place.name}
            onChange={(event) => change({ name: event.target.value }, `name-${place.key}`)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={cn("text-xs font-medium", detail)}>{t("fields.color")}</span>
        <ColorSwatchPicker
          key={`color-${place.key}-${place.color}`}
          name="plan-place-color"
          label={t("fields.color")}
          colors={PLACE_COLORS}
          defaultValue={place.color}
          onChange={(color) => change({ color })}
          className="gap-1.5 [&_span]:size-6"
        />
      </div>
      {planLabel?.areaM2 != null && <AreaCheck areaM2={polygonAreaM2(polygon)} planAreaM2={planLabel.areaM2} />}
      <Hint
        detail={detail}
        title={planLabel?.areaM2 != null ? undefined : formatArea(polygonAreaM2(polygon), currentLocale())}
      >
        {vertex !== undefined
          ? t("editor.place.vertexSelected", { index: vertex + 1, count: polygon.length })
          : t("editor.place.vertices", { count: polygon.length })}
      </Hint>
      <div className="flex flex-wrap gap-2">
        {place.id && (
          <Button asChild size="sm" variant="secondary" title={t("editor.place.open")}>
            <Link to={placeHref(place.id)}>
              <ExternalLinkIcon />
              <span className={detail}>{t("editor.place.open")}</span>
            </Link>
          </Button>
        )}
        {vertex !== undefined && polygon.length > 3 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            title={t("editor.place.deletePoint")}
            onClick={() => {
              dispatch({ type: "commit", doc: updatePlace(state.doc, place.key, { polygon: polygon.filter((_, index) => index !== vertex) }), selection: { type: "place", key: place.key } });
            }}
          >
            <EraserIcon />
            <span className={detail}>{t("editor.place.deletePoint")}</span>
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          title={t("editor.place.removeOutline")}
          onClick={() => dispatch({ type: "commit", doc: removeOutline(state.doc, place.key), selection: null })}
        >
          <Trash2Icon />
          <span className={detail}>{t("editor.place.removeOutline")}</span>
        </Button>
      </div>
    </div>
  );
}

function ElementProperties({ state, dispatch, detail, element }: ContextProps & { element: PlanElement }) {
  const { t } = useTranslation("places");
  const change = (patch: Partial<PlanElement>) => dispatch({ type: "commit", doc: updateElement(state.doc, element.id, patch) });
  const wall = element.kind === "wall" ? element : state.doc.elements.find((candidate) => candidate.id === element.wallId);

  return (
    <div className="flex flex-col gap-3">
      <Hint
        detail={detail}
        title={t(`editor.elements.${element.kind}`)}
      >
        {element.kind === "wall" && t("editor.wall.length", { length: formatLength(wallLength(element), currentLocale()) })}
        {element.kind !== "wall" && wall?.kind === "wall" && t("editor.hints.dragOpening")}
      </Hint>
      {element.kind === "wall" ? (
        <SizeSelect
          id="plan-selected-thickness"
          label={t("editor.fields.thickness")}
          value={element.thickness}
          options={WALL_THICKNESSES}
          onChange={(thickness) => change({ thickness })}
          detail={detail}
        />
      ) : (
        <SizeSelect
          id="plan-selected-width"
          label={t("editor.fields.width")}
          value={element.width}
          options={element.kind === "door" ? DOOR_WIDTHS : WINDOW_WIDTHS}
          onChange={(width) => {
            // Wider than the wall allows: keep the old width.
            if (wall?.kind === "wall" && wallLength(wall) < width) return;
            change({ width });
          }}
          detail={detail}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {element.kind === "door" && (
          <>
            <Button type="button" size="sm" variant="secondary" title={t("editor.door.flipHinge")} onClick={() => change({ hingeAtEnd: !element.hingeAtEnd })}>
              <FlipHorizontal2Icon />
              <span className={detail}>{t("editor.door.flipHinge")}</span>
            </Button>
            <Button type="button" size="sm" variant="secondary" title={t("editor.door.flipSwing")} onClick={() => change({ swingFlipped: !element.swingFlipped })}>
              <FlipVertical2Icon />
              <span className={detail}>{t("editor.door.flipSwing")}</span>
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          title={t("editor.elements.delete")}
          onClick={() => dispatch({ type: "commit", doc: removeElement(state.doc, element.id), selection: null })}
        >
          <Trash2Icon />
          <span className={detail}>{t("editor.elements.delete")}</span>
        </Button>
      </div>
    </div>
  );
}

function NothingSelected({ state, dispatch, floorKind, detail }: ContextProps) {
  const { t } = useTranslation("places");
  const unplaced = state.doc.places.filter((place) => !place.polygon);

  return (
    <div className="flex flex-col gap-3">
      <Hint detail={detail}>{t("editor.hints.select")}</Hint>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-grid-size" className={cn("text-xs", detail)}>
          {t("editor.fields.grid")}
        </Label>
        <Select
          value={String(state.doc.gridSize)}
          onValueChange={(value) => dispatch({ type: "commit", doc: { ...state.doc, gridSize: Number(value) } })}
        >
          <SelectTrigger id="plan-grid-size" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRID_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} cm
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {unplaced.length > 0 && (
        <div className={cn("flex flex-col gap-1.5", detail)}>
          <p className="text-xs font-medium">{t(`editor.unplaced.${floorKind}`)}</p>
          <ul className="flex flex-col gap-1">
            {unplaced.map((place) => (
              <li key={place.key} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: place.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{place.icon ? `${place.icon} ${place.name}` : place.name}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => dispatch({ type: "setTool", tool: "outline", outlineTarget: { type: "existing", key: place.key } })}
                >
                  <PencilRulerIcon />
                  {t("editor.unplaced.draw")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
