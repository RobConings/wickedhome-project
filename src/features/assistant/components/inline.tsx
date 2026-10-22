import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inlineVariants = cva("flex flex-row", {
  variants: {
    gap: {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-3",
      lg: "gap-6",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      baseline: "items-baseline",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
    },
    wrap: {
      true: "flex-wrap",
      false: "flex-nowrap",
    },
  },
  defaultVariants: { gap: "sm", align: "center", justify: "start", wrap: false },
});

type InlineProps = React.ComponentProps<"div"> & VariantProps<typeof inlineVariants>;

/** Horizontal row of items with a consistent gap. */
export function Inline({ gap, align, justify, wrap, className, ...props }: InlineProps) {
  return <div className={cn(inlineVariants({ gap, align, justify, wrap }), className)} {...props} />;
}
