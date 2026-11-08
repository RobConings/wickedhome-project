import type { LucideIcon } from "lucide-react";
import { Link, useLocation, type To } from "react-router";
import { Card } from "./card";
import { IconChip } from "./icon-chip";
import type { SectionAccent } from "@/lib/section-accent";
import { withRecordOrigin } from "@/lib/record-navigation";

export type RelatedRecordLink = {
  id: string;
  label: string;
  /** Omit when the owner has not supplied a count or summary. */
  value?: string | number;
  description?: string;
  to: To;
  icon: LucideIcon;
  accent: SectionAccent;
  current?: boolean;
};

/** Whole-card links to related records. Counts and destinations belong to the composing feature. */
export function RelatedRecordCards({ items, label }: { items: RelatedRecordLink[]; label: string }) {
  const location = useLocation();
  const origin = `${location.pathname}${location.search}${location.hash}`;
  return (
    <nav aria-label={label} className="related-record-grid grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:gap-3">
      {items.map((item) => (
        <Link
          key={item.id}
          to={typeof item.to === "string" ? withRecordOrigin(item.to, origin) : item.to}
          data-accent={item.accent}
          aria-label={item.value === undefined ? item.label : `${item.label} · ${item.value}`}
          aria-current={item.current ? "location" : undefined}
          className="group block min-w-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card tone={item.current ? "featured" : "default"} className="h-full min-h-[4.75rem] flex-row items-center gap-3 p-3 transition-colors group-hover:border-section-border group-hover:bg-section-soft">
            <IconChip icon={item.icon} tone={item.accent} size="sm" />
            <span className="min-w-0 break-words">
              <span className={item.value === undefined ? "block text-sm font-semibold" : "block text-xs font-medium text-muted-foreground"}>{item.label}</span>
              {item.value !== undefined && <span className="block text-base font-semibold tabular-nums">{item.value}</span>}
              {item.description && <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>}
            </span>
          </Card>
        </Link>
      ))}
    </nav>
  );
}
