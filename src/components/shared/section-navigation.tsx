import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Link, type To } from "react-router";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";

export type SectionNavigationItem = {
  id: string;
  label: string;
  to: To;
  icon: LucideIcon;
  current: boolean;
};

/** Navigation between an owner's views. Filters and cross-feature relationships have separate controls. */
export function SectionNavigation({ items, label, className }: { items: SectionNavigationItem[]; label: string; className?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const currentId = items.find((item) => item.current)?.id;
  React.useEffect(() => {
    const row = ref.current?.querySelector<HTMLElement>('[data-slot="scroll-row"]');
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const bounds = row.getBoundingClientRect();
    const selected = current.getBoundingClientRect();
    const left = selected.left < bounds.left ? selected.left - bounds.left - 4 : selected.right > bounds.right ? selected.right - bounds.right + 4 : 0;
    if (left) row.scrollBy({ left });
  }, [currentId]);
  return (
    <nav ref={ref} aria-label={label} className={cn("w-full min-w-0 max-w-full", className)}>
      <ScrollRow gap="xs" focusable={false}>
        {items.map(({ id, label: itemLabel, to, icon: Icon, current }) => (
          <Link
            key={id}
            to={to}
            aria-current={current ? "page" : undefined}
            preventScrollReset
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              current ? "border-section-border bg-section-soft text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {itemLabel}
          </Link>
        ))}
      </ScrollRow>
    </nav>
  );
}
