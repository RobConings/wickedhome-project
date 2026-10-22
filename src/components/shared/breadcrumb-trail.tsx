import * as React from "react";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  /** Omit for the current page (the last item). */
  to?: string;
  icon?: LucideIcon;
};

type BreadcrumbTrailProps = {
  items: BreadcrumbItem[];
  /** Accessible name of the navigation landmark. */
  label: string;
  /** With more items than this, the middle ones collapse into "…" (the first and last two stay). */
  maxItems?: number;
  className?: string;
};

/** Where you are in a hierarchy (folders, places), each level a link back up. */
export function BreadcrumbTrail({ items, label, maxItems = 5, className }: BreadcrumbTrailProps) {
  const [expanded, setExpanded] = React.useState(false);
  const collapse = !expanded && items.length > maxItems;
  const visible: (BreadcrumbItem | "ellipsis")[] = collapse
    ? [items[0] as BreadcrumbItem, "ellipsis", ...items.slice(-2)]
    : items;

  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {visible.map((item, index) => {
          const last = index === visible.length - 1;
          return (
            <li key={item === "ellipsis" ? "ellipsis" : `${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {item === "ellipsis" ? (
                <button
                  type="button"
                  className="rounded px-1 hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setExpanded(true)}
                  aria-label={items.slice(1, -2).map((hidden) => hidden.label).join(" / ")}
                >
                  …
                </button>
              ) : item.to && !last ? (
                <Link
                  to={item.to}
                  className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {item.icon && <item.icon className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  className={cn("flex min-w-0 items-center gap-1.5 px-1", last && "font-medium text-foreground")}
                  aria-current={last ? "page" : undefined}
                >
                  {item.icon && <item.icon className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
              {!last && <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
