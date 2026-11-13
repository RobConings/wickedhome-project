import type { To } from "react-router";
import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconChip } from "./icon-chip";
import { usePageIdentity } from "@/lib/page-identity";
import { useTranslation } from "react-i18next";
import { BreadcrumbTrail, type BreadcrumbItem } from "./breadcrumb-trail";
import { PageBackButton } from "./page-back-button";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small line above the title, e.g. a greeting or breadcrumb. */
  eyebrow?: React.ReactNode;
  /** The section's icon, shown in a chip in the section colour before the title. */
  icon?: LucideIcon | null;
  breadcrumbs?: BreadcrumbItem[];
  /** Parent destination; exact originating record/filter context takes precedence. */
  backTo?: To;
  /** A record hero can place the shared Back control above its media, once, in the page's normal slot. */
  showBack?: boolean;
  /** Buttons on the right (below the title on small screens). */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * The page title. A short bar in the current section's colour (`data-accent`, docs/BRANDING.md) sits above
 * it, so every page shows at a glance which part of the app it belongs to.
 */
export function PageHeader({ title, description, eyebrow, icon, breadcrumbs, backTo, showBack = true, actions, className }: PageHeaderProps) {
  const identity = usePageIdentity();
  const { t } = useTranslation();
  const shownIcon = icon === undefined && typeof title === "string" ? identity?.icon : icon;
  const trail: BreadcrumbItem[] | undefined = breadcrumbs ?? (!eyebrow && identity && !identity.isSectionRoot && typeof title === "string"
    ? [identity.section, { label: title }] : undefined);
  return (
    <header className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      {trail && trail.length > 0 && <BreadcrumbTrail items={trail} label={t("navigation.breadcrumbs")} className="hidden sm:block" />}
      <div data-slot="page-heading-layout" className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <div
          data-slot="page-heading"
          className={cn(
            "grid w-full min-w-0 gap-x-3 gap-y-2 xl:min-w-64 xl:flex-1",
            showBack || shownIcon ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
          )}
        >
          {(showBack || shownIcon) && <div className={cn(
            "col-start-1 row-start-1 flex shrink-0 items-center gap-2 self-center",
            description && (actions ? "2xl:row-span-2" : "md:row-span-2"),
          )}>
            {showBack && <PageBackButton to={backTo ?? trail?.slice().reverse().find((item) => item.to)?.to ?? (identity && !identity.isSectionRoot ? identity.section.to : undefined)} />}
            {shownIcon && <IconChip icon={shownIcon} />}
          </div>}
          <div className={cn("min-w-0", (showBack || shownIcon) && "col-start-2 row-start-1")}>
            <span aria-hidden="true" data-slot="page-accent" className="mb-2 block h-1 w-8 rounded-full bg-section" />
            {eyebrow && <p className="text-sm font-medium text-section-foreground">{eyebrow}</p>}
            <h1 className="text-2xl font-semibold tracking-tight break-words text-balance sm:text-3xl">{title}</h1>
          </div>
          {description && <p data-slot="page-description" className={cn(
            // Secondary copy is the first thing to disappear when header space is limited.
            // Phone: always hidden. Tablet: show only on pages without actions.
            // With title actions beside the heading, reserve descriptions for wide desktops.
            "hidden min-w-0 max-w-prose text-muted-foreground text-pretty",
            actions ? "2xl:block" : "md:block",
            (showBack || shownIcon) && "col-span-2 sm:col-span-1 sm:col-start-2",
          )}>{description}</p>}
        </div>
      {/* Below the complete title/description on phones and tablets; alongside it only on wide desktops. */}
      {actions && <div data-slot="page-header-actions" className="flex w-full min-w-0 flex-col items-stretch justify-center gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:max-w-[58%] xl:shrink-0 xl:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
