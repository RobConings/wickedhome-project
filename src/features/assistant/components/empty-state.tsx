import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {/* In the current section's colour (`data-accent`), with a soft ring so it reads as an illustration. */}
      <span className="grid size-12 place-items-center rounded-full bg-section-soft text-section ring-4 ring-section-soft/50">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="flex max-w-sm min-w-0 flex-col gap-1 break-words">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* Phones: the action(s) full width, their labels wrapping instead of running out of the button. */}
      {action && (
        <div className="flex w-full flex-col items-stretch gap-2 pt-1 max-sm:*:h-auto max-sm:*:min-h-10 max-sm:*:whitespace-normal sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
          {action}
        </div>
      )}
    </div>
  );
}
