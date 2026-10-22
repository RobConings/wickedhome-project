import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const stackVariants = cva("flex flex-col", {
  variants: {
    gap: {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
      xl: "gap-10",
    },
    align: {
      stretch: "items-stretch",
      start: "items-start",
      center: "items-center",
      end: "items-end",
    },
  },
  defaultVariants: { gap: "md", align: "stretch" },
});

type StackProps = React.ComponentProps<"div"> & VariantProps<typeof stackVariants>;

/** Vertical rhythm: children stacked with a consistent gap. */
export function Stack({ gap, align, className, ...props }: StackProps) {
  return <div className={cn(stackVariants({ gap, align }), className)} {...props} />;
}
