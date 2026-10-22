import type * as React from "react";
import type { LucideIcon } from "lucide-react";

type EmptyNoteProps = {
  /** An icon before the text; without one the note is just the dashed box with text. */
  icon?: LucideIcon;
  children: React.ReactNode;
};

/**
 * "Nothing here yet" inside a panel or dialog (a project's tasks, a task's materials): a small dashed box.
 * For a whole page or list use `EmptyState`.
 */
export function EmptyNote({ icon: Icon, children }: EmptyNoteProps) {
  if (!Icon) return <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{children}</p>;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
