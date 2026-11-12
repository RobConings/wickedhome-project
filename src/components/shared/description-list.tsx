import type * as React from "react";
import { cn } from "@/lib/utils";

/** Label/value pairs, e.g. the properties on a detail page. Two columns from `sm` up. */
export function DescriptionList({ columns = "2", className, ...props }: React.ComponentProps<"dl"> & { columns?: "1" | "2" }) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", columns === "2" && "sm:grid-cols-2", className)} {...props} />;
}

type DescriptionItemProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Span both columns, for long values such as notes. */
  wide?: boolean;
  className?: string;
  /** Horizontal label/value rows for compact property tables. */
  layout?: "stacked" | "row";
  valueClassName?: string;
};

export function DescriptionItem({ label, children, wide = false, className, layout = "stacked", valueClassName }: DescriptionItemProps) {
  return (
    <div className={cn("min-w-0", layout === "row" ? "grid grid-cols-2 gap-3" : "flex flex-col gap-1", wide && "sm:col-span-2", className)}>
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-sm font-medium break-words", valueClassName)}>{children}</dd>
    </div>
  );
}
