import * as React from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, TimerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const clock = (seconds: number) => {
  const s = Math.max(0, seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

/** A short beep (where audio may play) and a buzz (phones). */
function signal() {
  navigator.vibrate?.([300, 150, 300]);
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  } catch {
    // No audio: the toast and the buzz are enough.
  }
}

type StepTimerProps = {
  minutes: number;
  /** Shown in the "done" toast. */
  label: string;
  /** Seconds left to start with (stories). */
  initialSeconds?: number;
  className?: string;
};

/** A step's timer: start, pause, reset; buzzes, beeps and toasts when it runs out. Keeps counting on other steps only while shown. */
export function StepTimer({ minutes, label, initialSeconds, className }: StepTimerProps) {
  const { t } = useTranslation("recipes");
  const total = minutes * 60;
  const [left, setLeft] = React.useState(initialSeconds ?? total);
  const [endsAt, setEndsAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const remaining = Math.round((endsAt - Date.now()) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        setEndsAt(null);
        signal();
        toast.success(t("timer.done", { step: label }), { duration: 15_000 });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt, label, t]);

  const running = endsAt !== null;
  const start = () => setEndsAt(Date.now() + (left > 0 ? left : total) * 1000);
  const pause = () => setEndsAt(null);
  const reset = () => {
    setEndsAt(null);
    setLeft(total);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3", className)}>
      <TimerIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className={cn("text-2xl font-semibold tabular-nums", left === 0 && "text-primary")} role="timer" aria-live={running ? "off" : "polite"}>
        {clock(left)}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant={running ? "outline" : "default"} size="lg" onClick={running ? pause : start}>
          {running ? <PauseIcon /> : <PlayIcon />}
          {running ? t("timer.pause") : left < total && left > 0 ? t("timer.resume") : t("timer.start", { count: minutes })}
        </Button>
        {(left < total || running) && (
          <Button variant="ghost" size="icon-lg" onClick={reset} aria-label={t("timer.reset")} title={t("timer.reset")}>
            <RotateCcwIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
