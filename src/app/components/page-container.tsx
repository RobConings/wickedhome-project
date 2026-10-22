import type * as React from "react";
import { cn } from "@/lib/utils";

/** Page width, side gutters and vertical spacing between the page's top-level blocks. */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8", className)}
      {...props}
    />
  );
}
