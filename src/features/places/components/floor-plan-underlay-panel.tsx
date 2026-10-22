import * as React from "react";
import {
  CheckIcon,
  CircleCheckIcon,
  CropIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  LayersIcon,
  LockIcon,
  LockOpenIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RulerIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FloorUnderlay } from "../types/places";
import { distance } from "./floor-plan-geometry";
import { updateUnderlay, type PlanEditorAction, type PlanEditorState } from "./floor-plan-state";
import { formatArea, formatLength } from "./place-format";
import { parseLengthCm } from "./plan-length";
import {
  DEFAULT_DRAWING_SCALE,
  DRAWING_SCALES,
  applyDrawingScale,
  calibrateTwoPoint,
  compareArea,
  drawingRatio,
  rotateUnderlay,
} from "./underlay-geometry";

type PanelProps = {
  state: PlanEditorState;
  dispatch: React.Dispatch<PlanEditorAction>;
};

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat(intlLocale(currentLocale()), { maximumFractionDigits: digits }).format(value);

/** "Scale 1:50" for a PDF, "1 px = 0,85 cm" for an image. */
function scaleText(t: TFunction<"places">, underlay: FloorUnderlay): string {
  return underlay.unit === "pt"
    ? t("editor.underlay.ratio", { ratio: number(drawingRatio(underlay.scale)) })
    : t("editor.underlay.pixel", { cm: number(underlay.scale, 2) });
}

/**
 * The underlay part of the tools window: import a plan, or show/hide, fade, lock, rotate, calibrate,
 * crop again, replace and remove it. Every change is part of the plan (undo, explicit save).
 */
export function UnderlaySection({ state, dispatch, onImport, onRecrop }: PanelProps & { onImport: () => void; onRecrop: () => void }) {
  const { t } = useTranslation("places");
  const underlay = state.doc.underlay;
  const headingId = React.useId();

  if (!underlay) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-2 border-t pt-3">
        <h3 id={headingId} className="flex items-center gap-1.5 text-xs font-semibold">
          <LayersIcon className="size-3.5" aria-hidden="true" />
          {t("editor.underlay.title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("editor.underlay.empty")}</p>
        <Button type="button" size="sm" variant="secondary" onClick={onImport} className="self-start">
          <FileUpIcon />
          {t("editor.underlay.import")}
        </Button>
      </section>
    );
  }

  return <UnderlayControls state={state} dispatch={dispatch} underlay={underlay} headingId={headingId} onImport={onImport} onRecrop={onRecrop} />;
}

function UnderlayControls({
  state,
  dispatch,
  underlay,
  headingId,
  onImport,
  onRecrop,
}: PanelProps & { underlay: FloorUnderlay; headingId: string; onImport: () => void; onRecrop: () => void }) {
  const { t } = useTranslation("places");
  const change = (patch: Partial<FloorUnderlay>, coalesce?: string) => dispatch({ type: "commit", doc: updateUnderlay(state.doc, patch), coalesce });
  const quarter = Math.round(underlay.rotation / 90) * 90;
  const fine = Math.round((underlay.rotation - quarter) * 10) / 10;
  const rotate = (rotation: number, coalesce?: string) =>
    dispatch({ type: "commit", doc: { ...state.doc, underlay: rotateUnderlay(underlay, rotation) }, coalesce });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <LayersIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {t("editor.underlay.title")}
        </h3>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-pressed={underlay.visible}
            onClick={() => change({ visible: !underlay.visible })}
            title={underlay.visible ? t("editor.underlay.hide") : t("editor.underlay.show")}
            aria-label={underlay.visible ? t("editor.underlay.hide") : t("editor.underlay.show")}
          >
            {underlay.visible ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-pressed={underlay.locked}
            onClick={() => change({ locked: !underlay.locked })}
            title={underlay.locked ? t("editor.underlay.unlock") : t("editor.underlay.lock")}
            aria-label={underlay.locked ? t("editor.underlay.unlock") : t("editor.underlay.lock")}
          >
            {underlay.locked ? <LockIcon /> : <LockOpenIcon />}
          </Button>
        </div>
      </div>

      <p className="truncate text-xs text-muted-foreground" title={underlay.sourceName}>
        {underlay.unit === "pt" ? t("editor.underlay.sourcePage", { name: underlay.sourceName, page: underlay.page }) : underlay.sourceName}
      </p>

      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
          underlay.calibrated ? "bg-muted" : "bg-warning/15 text-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {underlay.calibrated ? (
            <CircleCheckIcon className="size-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <span className="truncate">{underlay.calibrated ? scaleText(t, underlay) : t("editor.underlay.notCalibrated")}</span>
        </span>
        <Button type="button" size="xs" variant={underlay.calibrated ? "ghost" : "default"} onClick={() => dispatch({ type: "setTool", tool: "calibrate" })}>
          <RulerIcon />
          {t("editor.underlay.calibrate")}
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="flex justify-between">
          {t("editor.underlay.opacity")}
          <span className="text-muted-foreground tabular-nums">{Math.round(underlay.opacity * 100)} %</span>
        </span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(underlay.opacity * 100)}
          onChange={(event) => change({ opacity: Number(event.target.value) / 100 }, "underlay-opacity")}
          className="h-6 w-full accent-primary"
        />
      </label>

      <div className="flex flex-col gap-1 text-xs">
        <span className="flex justify-between">
          {t("editor.underlay.rotation")}
          <span className="text-muted-foreground tabular-nums">{number(underlay.rotation)}°</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => rotate(underlay.rotation - 90)}
            aria-label={t("editor.underlay.rotateLeft")}
            title={t("editor.underlay.rotateLeft")}
          >
            <RotateCcwIcon />
          </Button>
          <input
            type="range"
            min={-10}
            max={10}
            step={0.1}
            value={fine}
            aria-label={t("editor.underlay.fineRotation")}
            onChange={(event) => rotate(quarter + Number(event.target.value), "underlay-rotation")}
            className="h-6 min-w-0 flex-1 accent-primary"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => rotate(underlay.rotation + 90)}
            aria-label={t("editor.underlay.rotateRight")}
            title={t("editor.underlay.rotateRight")}
          >
            <RotateCwIcon />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {underlay.locked ? t("editor.underlay.lockedHint") : t("editor.underlay.unlockedHint")}
        {underlay.labels.length > 0 && ` ${t("editor.underlay.labelsFound", { count: underlay.labels.length })}`}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="xs" variant="secondary" onClick={onRecrop}>
          <CropIcon />
          {t("editor.underlay.recrop")}
        </Button>
        <Button type="button" size="xs" variant="secondary" onClick={onImport}>
          <FileUpIcon />
          {t("editor.underlay.replace")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            dispatch({ type: "commit", doc: { ...state.doc, underlay: null } });
            toast(t("editor.underlay.removed"));
          }}
        >
          <Trash2Icon />
          {t("editor.underlay.remove")}
        </Button>
      </div>
    </section>
  );
}

/**
 * The calibrate tool: a measuring line (two clicks on the plan, ends draggable) and either its real length
 * or, for a vector PDF, the drawing scale. The line keeps showing its length, so the result can be checked
 * against any wall or dimension on the plan.
 */
export function CalibrateToolContext({ state, dispatch, detail }: PanelProps & { detail?: string }) {
  const { t } = useTranslation("places");
  const locale = currentLocale();
  const underlay = state.doc.underlay;
  const [lengthText, setLengthText] = React.useState("");
  const [ratio, setRatio] = React.useState(String(DEFAULT_DRAWING_SCALE));
  const { a, b } = state.calibration;
  const measured = a && b ? distance(a, b) : null;
  const realCm = parseLengthCm(lengthText);

  if (!underlay) {
    return <p className="text-xs text-muted-foreground">{t("editor.calibrate.noUnderlay")}</p>;
  }

  const applyLength = (event: React.FormEvent) => {
    event.preventDefault();
    if (!a || !b || realCm === null) return;
    const next = calibrateTwoPoint(underlay, a, b, realCm);
    if (!next) return;
    dispatch({ type: "commit", doc: { ...state.doc, underlay: next } });
    // The line's end follows the new scale, so it now measures exactly the typed length.
    const localEnd = { x: a.x + ((b.x - a.x) * realCm) / (measured ?? realCm), y: a.y + ((b.y - a.y) * realCm) / (measured ?? realCm) };
    dispatch({ type: "setCalibration", calibration: { a, b: localEnd } });
    setLengthText("");
    toast.success(t("editor.calibrate.done"));
  };

  const applyRatio = () => {
    const next = applyDrawingScale(underlay, Number(ratio), a ?? underlay.center);
    dispatch({ type: "commit", doc: { ...state.doc, underlay: next } });
    if (a && b) {
      // Keep the measuring line on the same spot of the drawing: it rescales around `a` like the underlay.
      const factor = next.scale / underlay.scale;
      dispatch({ type: "setCalibration", calibration: { a, b: { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor } } });
    }
    toast.success(t("editor.calibrate.done"));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex flex-col gap-1", detail)}>
        <p className="text-sm font-semibold">{t("editor.calibrate.title")}</p>
        <p className="text-xs text-muted-foreground">{t("editor.calibrate.hint")}</p>
      </div>

      {measured !== null ? (
        <form onSubmit={applyLength} className="flex flex-col gap-1.5">
          <p className="text-xs" aria-live="polite">
            {t("editor.calibrate.measures", { length: formatLength(measured, locale) })}
          </p>
          <Label htmlFor="plan-calibrate-length" className="text-xs">
            {t("editor.calibrate.realLength")}
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="plan-calibrate-length"
              className="h-8"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t("editor.calibrate.placeholder")}
              value={lengthText}
              aria-invalid={(lengthText.trim() !== "" && realCm === null) || undefined}
              onChange={(event) => setLengthText(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={realCm === null}>
              {t("editor.calibrate.apply")}
            </Button>
          </div>
          <p className={cn("text-xs", lengthText.trim() !== "" && realCm === null ? "text-destructive" : "text-muted-foreground")}>
            {lengthText.trim() === ""
              ? t("editor.calibrate.formats")
              : realCm === null
                ? t("editor.calibrate.unreadable")
                : t("editor.calibrate.reads", { length: formatLength(realCm, locale) })}
          </p>
        </form>
      ) : (
        <p className="rounded-md bg-muted px-2 py-1.5 text-xs">{a ? t("editor.calibrate.secondPoint") : t("editor.calibrate.firstPoint")}</p>
      )}

      {underlay.unit === "pt" && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <Label htmlFor="plan-calibrate-ratio" className="text-xs">
            {t("editor.calibrate.drawingScale")}
          </Label>
          <div className="flex gap-1.5">
            <Select value={ratio} onValueChange={setRatio}>
              <SelectTrigger id="plan-calibrate-ratio" size="sm" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRAWING_SCALES.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    1:{value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="secondary" onClick={applyRatio}>
              {t("editor.calibrate.apply")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("editor.calibrate.drawingScaleHint")}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {underlay.calibrated ? scaleText(t, underlay) : t("editor.underlay.notCalibrated")}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: "setTool", tool: "select" })}>
          <CheckIcon />
          {t("editor.calibrate.finish")}
        </Button>
      </div>
    </div>
  );
}

/** "17,32 m² · plan says 17,32 m² ✓", or a warning when they differ by more than 3 %. */
export function AreaCheck({ areaM2, planAreaM2, className }: { areaM2: number; planAreaM2: number | null; className?: string }) {
  const { t } = useTranslation("places");
  const locale = currentLocale();
  if (planAreaM2 === null) return <span className={cn("text-xs", className)}>{formatArea(areaM2, locale, 2)}</span>;
  const { difference, matches } = compareArea(areaM2, planAreaM2);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 text-xs", className)}>
      {matches ? (
        <CircleCheckIcon className="size-3.5 text-success" aria-label={t("editor.area.matches")} />
      ) : (
        <TriangleAlertIcon className="size-3.5 text-warning" aria-label={t("editor.area.mismatch")} />
      )}
      {formatArea(areaM2, locale, 2)} · {t("editor.area.planSays", { area: formatArea(planAreaM2, locale, 2) })}
      {!matches && <span className="text-warning">({t("editor.area.differs", { percent: number(Math.abs(difference) * 100, 0) })})</span>}
    </span>
  );
}
