import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ZoomControlProps = {
  /** Current zoom as a percentage, e.g. 100. */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Fit the content to the view. */
  onFit: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  labels: { zoomIn: string; zoomOut: string; fit: string };
  className?: string;
};

/** Compact zoom buttons for a canvas or map: out, current percentage, in, fit. */
export function ZoomControl({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  canZoomIn = true,
  canZoomOut = true,
  labels,
  className,
}: ZoomControlProps) {
  return (
    <div
      role="group"
      aria-label={`${Math.round(zoom)}%`}
      className={cn("inline-flex items-center gap-0.5 rounded-lg border bg-popover/95 p-1 shadow-sm backdrop-blur", className)}
    >
      <Button type="button" variant="ghost" size="icon-sm" onClick={onZoomOut} disabled={!canZoomOut} aria-label={labels.zoomOut} title={labels.zoomOut}>
        <MinusIcon />
      </Button>
      <span className="min-w-12 text-center text-xs font-medium text-muted-foreground tabular-nums" aria-live="polite">
        {Math.round(zoom)}%
      </span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onZoomIn} disabled={!canZoomIn} aria-label={labels.zoomIn} title={labels.zoomIn}>
        <PlusIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onFit} aria-label={labels.fit} title={labels.fit}>
        <ScanIcon />
      </Button>
    </div>
  );
}
