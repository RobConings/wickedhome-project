/** A decorative dot in an item's own colour (a place, project, calendar, event). */
export function ColorDot({ color, className = "size-2.5 shrink-0 rounded-full" }: { color: string; className?: string }) {
  return <span className={className} style={{ backgroundColor: color }} aria-hidden="true" />;
}
