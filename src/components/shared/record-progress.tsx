import { Progress } from "@/components/ui/progress";
import { CheckCircle2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Progress only counts facts provided by the owner; never predicts an unknown total. */
export function RecordProgress({ label, completed, total, summary, className }: {
  label: string; completed: number; total: number; summary?: string; className?: string;
}) {
  const max = Math.max(0, total);
  const value = Math.min(max, Math.max(0, completed));
  return <div className={cn("rounded-xl border border-section-border bg-section-soft p-4", className)}>
    <div className="flex items-center gap-3"><CheckCircle2Icon className="size-6 shrink-0 text-section" aria-hidden="true" />
      <span className="flex-1 font-medium">{label}</span><span className="font-semibold tabular-nums">{value} / {max}</span>
    </div>
    {max > 0 && <Progress aria-label={label} aria-valuetext={`${value} / ${max}`} value={value / max * 100} className="mt-3 h-2 [&_[data-slot=progress-indicator]]:bg-section" />}
    {summary && <p className="mt-2 text-sm text-muted-foreground">{summary}</p>}
  </div>;
}
