import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconChip } from "./icon-chip";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small line above the title, e.g. a greeting or breadcrumb. */
  eyebrow?: React.ReactNode;
  /** The section's icon, shown in a chip in the section colour before the title. */
  icon?: LucideIcon;
  /** Buttons on the right (below the title on small screens). */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * The page title. A short bar in the current section's colour (`data-accent`, docs/BRANDING.md) sits above
 * it, so every page shows at a glance which part of the app it belongs to.
 */
export function PageHeader({ title, description, eyebrow, icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconChip icon={icon} className="mt-1 hidden sm:grid" />}
        <div className="flex min-w-0 flex-col gap-1">
          <span aria-hidden="true" data-slot="page-accent" className="mb-1 h-1 w-8 rounded-full bg-section" />
          {eyebrow && <p className="text-sm font-medium text-section-foreground">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight break-words text-balance sm:text-3xl">{title}</h1>
          {description && <p className="max-w-prose text-muted-foreground text-pretty">{description}</p>}
        </div>
      </div>
      {/* Under the title on phones, wrapping onto more lines rather than running off the screen. */}
      {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}
