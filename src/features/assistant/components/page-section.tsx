import type * as React from "react";
import { cn } from "@/lib/utils";

/** A self-contained block of a page. Groups its children with consistent internal spacing. */
export function PageSection({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("flex min-w-0 flex-col gap-4", className)} {...props} />;
}
