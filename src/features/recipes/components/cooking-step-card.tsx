import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, ListOrderedIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "./card";
import type { RecipeStep } from "../types/recipes";
import { StepTimer } from "./step-timer";

type CookingStepCardProps = {
  steps: RecipeStep[];
  /** 0-based. */
  current: number;
  onChange: (step: number) => void;
  /** Shown instead of "Next" on the last step (e.g. "Done cooking"). */
  finish?: React.ReactNode;
};

const SWIPE_PX = 60;

/**
 * One step at a time, in large text: Previous / Next (or swipe left and right on a phone), "step 2 of 5",
 * and the step's timer when it has one. Without steps it says so; the ingredients still work.
 */
export function CookingStepCard({ steps, current, onChange, finish }: CookingStepCardProps) {
  const { t } = useTranslation("recipes");
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const step = steps[current];
  const last = current >= steps.length - 1;

  if (!step) {
    return (
      <Card className="gap-4 p-5">
        <p className="flex items-center gap-2 text-muted-foreground">
          <ListOrderedIcon className="size-5 shrink-0" aria-hidden="true" />
          {t("cooking.noSteps")}
        </p>
        {finish}
      </Card>
    );
  }

  const go = (next: number) => onChange(Math.min(steps.length - 1, Math.max(0, next)));

  return (
    <Card
      className="touch-pan-y gap-5 p-5 sm:p-6"
      onPointerDown={(event) => {
        if (event.pointerType === "touch") start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const dx = event.clientX - from.x;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(event.clientY - from.y)) go(current + (dx < 0 ? 1 : -1));
      }}
      onPointerCancel={() => (start.current = null)}
      aria-roledescription={t("cooking.stepsRole")}
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {t("cooking.stepOf", { step: current + 1, total: steps.length })}
        </span>
        <Progress value={((current + 1) / steps.length) * 100} aria-hidden="true" />
      </div>
      <p className="min-h-32 text-xl leading-relaxed break-words whitespace-pre-line sm:text-2xl">{step.text}</p>
      {step.timerMinutes && (
        <StepTimer
          key={step.id}
          minutes={step.timerMinutes}
          label={t("cooking.stepOf", {
            step: current + 1,
            total: steps.length,
          })}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="h-12" onClick={() => go(current - 1)} disabled={current === 0}>
          <ChevronLeftIcon />
          {t("cooking.previous")}
        </Button>
        {last && finish ? (
          finish
        ) : (
          <Button size="lg" className="h-12" onClick={() => go(current + 1)} disabled={last}>
            {t("cooking.next")}
            <ChevronRightIcon />
          </Button>
        )}
      </div>
    </Card>
  );
}
