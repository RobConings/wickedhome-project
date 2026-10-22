import type * as React from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

type TagChipProps = {
  label: string;
  /** `#rrggbb` (or any CSS colour): the dot before the label. */
  color?: string;
  /** Icon instead of the colour dot. */
  icon?: React.ReactNode;
  /** Makes the chip a link. It sits above row-wide links (`relative z-10`), so it stays tappable inside a row. */
  to?: string;
  /** Accessible name when the label alone is not enough, e.g. "Project: Bathroom". */
  title?: string;
  className?: string;
};

/** A small coloured label, optionally a link: a project, a tag, a group a row belongs to. */
export function TagChip({ label, color, icon, to, title, className }: TagChipProps) {
  const content = (
    <>
      {icon ? (
        <span className="flex shrink-0 [&_svg]:size-3.5" aria-hidden="true" style={color ? { color } : undefined}>
          {icon}
        </span>
      ) : (
        color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </>
  );
  const classes = cn(
    "inline-flex max-w-48 min-w-0 items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-foreground",
    className,
  );
  return to ? (
    <Link
      to={to}
      title={title}
      aria-label={title}
      className={cn(classes, "relative z-10 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50")}
    >
      {content}
    </Link>
  ) : (
    <span title={title} className={classes}>
      {content}
    </span>
  );
}
