import * as React from "react";
import { cn } from "@/lib/utils";

const GAPS = { xs: "gap-1", sm: "gap-1.5", md: "gap-2", lg: "gap-3" } as const;

/** From this breakpoint up the items wrap onto more lines instead of scrolling. */
const WRAP_FROM = {
  sm: "sm:flex-wrap sm:overflow-x-visible",
  md: "md:flex-wrap md:overflow-x-visible",
  lg: "lg:flex-wrap lg:overflow-x-visible",
} as const;

type ScrollRowProps = Omit<React.ComponentProps<"div">, "ref"> & {
  /**
   * Accessible name of the row. Makes it a labelled group; when it overflows and its items are not
   * focusable themselves (e.g. legend chips), keyboard users can focus it and scroll with the arrow keys.
   */
  label?: string;
  gap?: keyof typeof GAPS;
  /** Scroll only below this breakpoint; from there up the items wrap onto more lines. */
  wrapFrom?: keyof typeof WRAP_FROM;
  /**
   * The row itself becomes a tab stop while it overflows (default). Turn off when every item is
   * focusable already (buttons, radios): focusing an item scrolls it into view.
   */
  focusable?: boolean;
};

const FADE = "1.25rem";

/**
 * The ONE way to scroll sideways (docs/ADDING-A-FEATURE.md, "Phone first"): a single row of chips, tabs,
 * segments, days or periods that scrolls inside itself, never the page. Snaps to items, hides the
 * scrollbar on touch screens, fades the edge that has more content, and stays keyboard reachable.
 * Its items keep their natural width (`shrink-0`).
 */
export function ScrollRow({
  label,
  gap = "md",
  wrapFrom,
  focusable = true,
  className,
  style,
  children,
  ...props
}: ScrollRowProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      // `scrollLeft` is negative in right-to-left layouts; the distance from the start is what counts.
      const position = Math.abs(element.scrollLeft);
      const next = { start: max > 1 && position > 1, end: max > 1 && position < max - 1 };
      setEdges((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
    };
    element.addEventListener("scroll", update, { passive: true });
    // The observer also reports the first size right after `observe`, which sets the initial fades.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of Array.from(element.children)) observer?.observe(child);
    const frame = observer ? 0 : window.requestAnimationFrame(update);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [children]);

  const overflowing = edges.start || edges.end;
  const mask = overflowing
    ? `linear-gradient(to right, ${edges.start ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.end ? "transparent" : "#000"})`
    : undefined;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Arrow keys scroll the row when the row itself has focus (not one of its items).
    if (event.target !== event.currentTarget) return;
    const step = event.currentTarget.clientWidth * 0.8;
    if (event.key === "ArrowRight") event.currentTarget.scrollBy({ left: step, behavior: "smooth" });
    else if (event.key === "ArrowLeft") event.currentTarget.scrollBy({ left: -step, behavior: "smooth" });
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={ref}
      role={label ? "group" : undefined}
      aria-label={label}
      tabIndex={focusable && overflowing ? 0 : undefined}
      onKeyDown={focusable ? onKeyDown : undefined}
      data-slot="scroll-row"
      data-overflowing={overflowing || undefined}
      style={{ ...style, maskImage: mask, WebkitMaskImage: mask }}
      className={cn(
        "flex max-w-full min-w-0 snap-x snap-proximity scroll-px-1 items-center overflow-x-auto overscroll-x-contain py-1 outline-none *:shrink-0 *:snap-start",
        // A thin scrollbar with a mouse; none on touch screens (the fade shows there is more).
        "[scrollbar-width:thin] pointer-coarse:[scrollbar-width:none] pointer-coarse:[&::-webkit-scrollbar]:hidden",
        // Inset: the edge fade (a mask) would hide a ring drawn outside the row.
        "rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
        GAPS[gap],
        wrapFrom && WRAP_FROM[wrapFrom],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
