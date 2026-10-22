import type * as React from "react";
import { cn } from "@/lib/utils";

/** Label/value pairs, e.g. the properties on a detail page. Two columns from `sm` up. */
export function DescriptionList({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)} {...props} />;
}

type DescriptionItemProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Span both columns, for long values such as notes. */
  wide?: boolean;
  className?: string;
};

export function DescriptionItem({ label, children, wide = false, className }: DescriptionItemProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}
