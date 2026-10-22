import * as React from "react";
import { GripHorizontalIcon, Maximize2Icon, Minimize2Icon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Position = { x: number; y: number };
type Stored = { position: Position | null; compact: boolean };

/** Distance the panel keeps from the edges of its container, in px. */
const MARGIN = 16;

type FloatingPanelProps = {
  /** Accessible name of the panel. */
  label: string;
  moveLabel: string;
  resetLabel: string;
  compactLabel: string;
  expandLabel: string;
  /** Remembers position and compact state on this device (localStorage) under this key. */
  storageKey?: string;
  defaultCompact?: boolean;
  className?: string;
  /** Panel content. As a function it receives `compact`, so text can be hidden (e.g. `sr-only`). */
  children: React.ReactNode | ((compact: boolean) => React.ReactNode);
};

function readStored(key: string | undefined): Stored | null {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Stored | null;
    return value && typeof value.compact === "boolean" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string | undefined, value: Stored) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered on this device; the panel still works.
  }
}

/**
 * A tools window that floats over a canvas. Place it inside a `relative` container: it starts in the
 * top-right corner and follows it on resize until the user drags it away by its grip, stays inside the
 * container, can be reset, and can shrink to a compact icon strip.
 */
export function FloatingPanel({
  label,
  moveLabel,
  resetLabel,
  compactLabel,
  expandLabel,
  storageKey,
  defaultCompact = false,
  className,
  children,
}: FloatingPanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; startX: number; startY: number; origin: Position } | null>(null);
  const [stored] = React.useState(() => readStored(storageKey));
  // null = default corner, which follows the container size.
  const [position, setPosition] = React.useState<Position | null>(stored?.position ?? null);
  const [compact, setCompact] = React.useState(stored?.compact ?? defaultCompact);

  const clamp = React.useCallback((value: Position): Position => {
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return value;
    const maxX = Math.max(MARGIN, container.clientWidth - panel.offsetWidth - MARGIN);
    const maxY = Math.max(MARGIN, container.clientHeight - panel.offsetHeight - MARGIN);
    return { x: Math.min(Math.max(value.x, MARGIN), maxX), y: Math.min(Math.max(value.y, MARGIN), maxY) };
  }, []);

  // Keep a moved panel inside the container when it resizes or the panel changes size.
  React.useEffect(() => {
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const observer = new ResizeObserver(() => setPosition((current) => (current ? clamp(current) : current)));
    observer.observe(container);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [clamp]);

  React.useEffect(() => writeStored(storageKey, { position, compact }), [storageKey, position, compact]);

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const panel = panelRef.current;
    if (!panel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: panel.offsetLeft, y: panel.offsetTop },
    };
  }

  function drag(event: React.PointerEvent<HTMLButtonElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    setPosition(clamp({ x: state.origin.x + event.clientX - state.startX, y: state.origin.y + event.clientY - state.startY }));
  }

  function stopDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={label}
      data-compact={compact}
      className={cn(
        "absolute z-10 flex max-h-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto rounded-xl border bg-popover/95 p-3 text-popover-foreground shadow-md backdrop-blur",
        compact ? "w-[min(12rem,calc(100%-2rem))]" : "w-[min(20rem,calc(100%-2rem))] 2xl:w-[22rem]",
        !position && "top-4 right-4",
        className,
      )}
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={moveLabel}
          title={moveLabel}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          className="inline-flex h-8 flex-1 cursor-move touch-none items-center justify-center rounded-md border bg-muted text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <GripHorizontalIcon className="size-4" aria-hidden="true" />
        </button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={resetLabel}
          title={resetLabel}
          onClick={() => setPosition(null)}
        >
          <RotateCcwIcon />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={compact ? expandLabel : compactLabel}
          title={compact ? expandLabel : compactLabel}
          aria-pressed={compact}
          onClick={() => setCompact((value) => !value)}
        >
          {compact ? <Maximize2Icon /> : <Minimize2Icon />}
        </Button>
      </div>
      {typeof children === "function" ? children(compact) : children}
    </div>
  );
}
