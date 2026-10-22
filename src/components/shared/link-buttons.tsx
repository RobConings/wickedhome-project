import type * as React from "react";
import { ArrowLeftIcon, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

type LinkProps = { to: string; children: React.ReactNode };

/** The small "← Tasks" link above a detail page's title: put it in `PageHeader`'s `eyebrow`. */
export function BackLink({ to, children }: LinkProps) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 hover:underline">
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}

type GhostLinkButtonProps = LinkProps & {
  icon: LucideIcon;
  /** Placement classes, e.g. `self-start text-muted-foreground` for a section's "go to …" footer. */
  className?: string;
};

/** A small ghost button that navigates: a section's "go to …" footer link, or (with `BackButton`) a back link. */
export function GhostLinkButton({ to, icon: Icon, className, children }: GhostLinkButtonProps) {
  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link to={to}>
        <Icon />
        {children}
      </Link>
    </Button>
  );
}

/** "← Back" as a ghost button at the top of a detail page (left-aligned with the content by default). */
export function BackButton({ to, className = "-ml-2 self-start text-muted-foreground", children }: LinkProps & { className?: string }) {
  return (
    <GhostLinkButton to={to} icon={ArrowLeftIcon} className={className}>
      {children}
    </GhostLinkButton>
  );
}
