import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const inlineAlertVariants = cva("flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", {
  variants: {
    tone: {
      info: "border-info-border bg-info-soft text-foreground [&>svg]:text-info",
      success: "border-success-border bg-success-soft text-foreground [&>svg]:text-success",
      warning: "border-warning-border bg-warning-soft text-foreground [&>svg]:text-warning",
      error: "border-danger-border bg-danger-soft text-foreground [&>svg]:text-danger",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons = { info: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, error: CircleAlertIcon };

type InlineAlertProps = VariantProps<typeof inlineAlertVariants> & {
  children: React.ReactNode;
  className?: string;
};

/** A short message inside the page flow, e.g. a form-level error. */
export function InlineAlert({ tone = "info", children, className }: InlineAlertProps) {
  const Icon = icons[tone ?? "info"];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(inlineAlertVariants({ tone }), className)}>
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
