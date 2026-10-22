import type * as React from "react";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/** Full-area message when a page or section could not be shown. */
export function ErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-6" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-lg font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
