import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("", {
  variants: {
    size: { xs: "text-xs", sm: "text-sm", base: "text-base", lg: "text-lg", xl: "text-xl", "2xl": "text-2xl", "3xl": "text-3xl" },
    tone: { muted: "text-muted-foreground", danger: "text-destructive", primary: "text-primary", success: "text-success", warning: "text-warning" },
    weight: { normal: "font-normal", medium: "font-medium", semibold: "font-semibold", bold: "font-bold" },
  },
});

/** Body copy and numeric values. Inherits its context unless a text style is selected. */
export function Text({ size, tone, weight, className, ...props }: React.ComponentProps<"p"> & VariantProps<typeof textVariants>) {
  return <p className={cn(textVariants({ size, tone, weight }), className)} {...props} />;
}
