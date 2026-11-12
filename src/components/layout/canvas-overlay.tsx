import type * as React from "react";
import { cn } from "@/lib/utils";

/** Pin controls or status content inside a positioned canvas without widening its viewport. */
export function CanvasOverlay({ corner = "bottom-start", className, ...props }: React.ComponentProps<"div"> & { corner?: "bottom-start" | "bottom-end" | "top-start" | "top-end" }) {
  return <div className={cn("absolute z-10 max-w-[min(22rem,calc(100%-1.5rem))]", corner.startsWith("bottom") ? "bottom-3" : "top-3", corner.endsWith("start") ? "left-3" : "right-3", className)} {...props} />;
}
