import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Field structure of a form: one column on phones, two from `sm` up. Items span the full width unless
 * they ask for half. Knows the columns, never which fields go in them.
 */
export function FormGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2", className)} {...props} />;
}

const formGridItemVariants = cva("min-w-0", {
  variants: {
    span: {
      full: "sm:col-span-2",
      half: "",
    },
  },
  defaultVariants: { span: "full" },
});

type FormGridItemProps = React.ComponentProps<"div"> & VariantProps<typeof formGridItemVariants>;

/** One cell of a `FormGrid`: the full row (default) or half of it from `sm` up. */
export function FormGridItem({ span, className, ...props }: FormGridItemProps) {
  return <div className={cn(formGridItemVariants({ span }), className)} {...props} />;
}
