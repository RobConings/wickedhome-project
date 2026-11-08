import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Link, type To } from "react-router";
import { workspaceTabListClassName, workspaceTabTriggerClassName } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SectionNavigationItem = {
  id: string;
  label: string;
  to: To;
  icon: LucideIcon;
  current: boolean;
};

/**
 * Routed page tabs share exactly the same visual tokens as RecordWorkspaceTabs.
 * Use links here (not ARIA tabs without panels), so URL navigation and browser history remain correct.
 */
export function SectionNavigation({ items, label, className }: { items: SectionNavigationItem[]; label: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const currentId = items.find((item) => item.current)?.id;
  React.useEffect(() => {
    const row = ref.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const bounds = row.getBoundingClientRect();
    const selected = current.getBoundingClientRect();
    const delta = selected.left < bounds.left ? selected.left - bounds.left - 4 : selected.right > bounds.right ? selected.right - bounds.right + 4 : 0;
    if (delta) row.scrollBy({ left: delta });
  }, [currentId]);

  return (
    <nav aria-label={label} className={cn("w-full min-w-0 max-w-full", className)}>
      <div ref={ref} className={cn(workspaceTabListClassName, "flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>
        {items.map(({ id, label: itemLabel, to, icon: Icon, current }) => (
          <Link
            key={id}
            to={to}
            aria-current={current ? "page" : undefined}
            preventScrollReset
            className={cn(
              workspaceTabTriggerClassName,
              "inline-flex min-w-24 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent text-center text-sm font-medium text-foreground/70 transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              current ? "bg-card text-foreground shadow-sm [&_svg]:text-section dark:border-section-border dark:bg-elevated" : "hover:bg-card/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{itemLabel}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
