import * as React from "react";
import { CheckIcon, CompassIcon, NavigationIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlanEditorAction, PlanEditorState } from "./floor-plan-state";
import { COMPASS_POINTS, compassPoint, northFromArrow, northFromTopFacing, topFacing } from "./plan-orientation";

type PanelProps = {
  state: PlanEditorState;
  dispatch: React.Dispatch<PlanEditorAction>;
};

/** Whole degrees 0–359 as typed; null for anything else. */
function parseDegrees(text: string): number | null {
  const trimmed = text.trim().replace(/°$/, "");
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value < 360 ? value : null;
}

/**
 * The orientation part of the tools window: where north is on the plan, as degrees, as the direction the
 * top of the plan faces (N, NE, E…), or by clicking the architect's north arrow. One value for the whole
 * house (every floor), saved with the plan; the compass rose on the plan is a dial for the same value.
 */
export function OrientationSection({ state, dispatch }: PanelProps) {
  const { t } = useTranslation("places");
  const headingId = React.useId();
  const inputId = React.useId();
  const north = state.doc.north;
  const setNorth = (value: number | null, coalesce?: string) => dispatch({ type: "commit", doc: { ...state.doc, north: value }, coalesce });
  // What is being typed, for the north value it was typed against (undo or the dial show their value again).
  const [draft, setDraft] = React.useState<{ text: string; north: number | null } | null>(null);
  const text = draft && draft.north === north ? draft.text : north === null ? "" : String(Math.round(north));
  const facing = north === null ? null : compassPoint(topFacing(north));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <CompassIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {t("orientation.title")}
        </h3>
        {north !== null && (
          <Button type="button" size="xs" variant="ghost" onClick={() => setNorth(null)} title={t("orientation.clear")}>
            <XIcon />
            {t("orientation.clear")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-xs">
          {t("orientation.degrees")}
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id={inputId}
            className="h-8 w-20"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0–359"
            value={text}
            aria-invalid={(text.trim() !== "" && parseDegrees(text) === null) || undefined}
            onChange={(event) => {
              const value = parseDegrees(event.target.value);
              setDraft({ text: event.target.value, north: value ?? north });
              if (value !== null && value !== north) setNorth(value, "north-input");
            }}
          />
          <span className="text-xs text-muted-foreground">°</span>
          <span className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
            {facing ? t("orientation.topFacesValue", { direction: t(`orientation.names.${facing}`) }) : t("orientation.notSet")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span id={`${headingId}-presets`} className="text-xs">
          {t("orientation.topFaces")}
        </span>
        <div role="group" aria-labelledby={`${headingId}-presets`} className="grid grid-cols-4 gap-1">
          {COMPASS_POINTS.map((point, index) => {
            const value = northFromTopFacing(index * 45);
            const pressed = north !== null && Math.abs(north - value) < 0.05;
            return (
              <Button
                key={point}
                type="button"
                size="xs"
                variant={pressed ? "default" : "outline"}
                aria-pressed={pressed}
                title={t(`orientation.names.${point}`)}
                onClick={() => setNorth(value)}
              >
                {t(`orientation.points.${point}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <Button type="button" size="xs" variant="secondary" className="self-start" onClick={() => dispatch({ type: "setTool", tool: "north" })}>
        <NavigationIcon />
        {t("orientation.pointNorth")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("orientation.hint")}</p>
    </section>
  );
}

/** The north tool: click the tail, then the tip of the architect's north arrow on the plan. */
export function NorthToolContext({ state, dispatch, detail }: PanelProps & { detail?: string }) {
  const { t } = useTranslation("places");
  const { a, b } = state.northArrow;
  const result = a && b ? northFromArrow(state.doc.underlay, a, b) : null;

  const apply = () => {
    if (result === null) return;
    dispatch({ type: "commit", doc: { ...state.doc, north: result } });
    dispatch({ type: "setTool", tool: "select" });
    toast.success(t("orientation.tool.done", { degrees: Math.round(result) }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex flex-col gap-1", detail)}>
        <p className="text-sm font-semibold">{t("orientation.tool.title")}</p>
        <p className="text-xs text-muted-foreground">
          {state.doc.underlay ? t("orientation.tool.hint") : t("orientation.tool.hintNoPlan")}
        </p>
      </div>
      {result !== null ? (
        <p className="rounded-md bg-muted px-2 py-1.5 text-xs" aria-live="polite">
          {t("orientation.tool.result", {
            degrees: Math.round(result),
            direction: t(`orientation.names.${compassPoint(topFacing(result))}`),
          })}
        </p>
      ) : (
        <p className="rounded-md bg-muted px-2 py-1.5 text-xs" aria-live="polite">
          {a ? t("orientation.tool.tip") : t("orientation.tool.tail")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: "setTool", tool: "select" })}>
          {t("orientation.tool.cancel")}
        </Button>
        <Button type="button" size="sm" disabled={result === null} onClick={apply}>
          <CheckIcon />
          {t("orientation.tool.apply")}
        </Button>
      </div>
    </div>
  );
}
