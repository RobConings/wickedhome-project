import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * How a card stands out (docs/BRANDING.md): `attention` = a peach edge, "this needs you" (suggestions,
 * things to confirm); `section` = an edge in the current section's colour; `featured` = a soft fill in the
 * section colour; `danger` / `warning` / `success` = a status edge. Default: a plain surface.
 */
export type CardTone = "default" | "attention" | "section" | "featured" | "danger" | "warning" | "success";

const TONES: Record<CardTone, string> = {
  default: "",
  attention: "border-l-[3px] border-l-highlight-strong",
  section: "border-l-[3px] border-l-section",
  featured: "border-section-border bg-section-soft",
  danger: "border-l-[3px] border-danger-border border-l-danger",
  warning: "border-l-[3px] border-warning-border border-l-warning",
  success: "border-l-[3px] border-success-border border-l-success",
};

/** Surface for grouping related content. Compose with the Card* parts below. */
export function Card({ className, tone = "default", ...props }: React.ComponentProps<"div"> & { tone?: CardTone }) {
  return (
    <div
      data-tone={tone === "default" ? undefined : tone}
      className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs", TONES[tone], className)}
      {...props}
    />
  );
}

/** Title row of a card; its parts may shrink (`min-w-0`), so a long title wraps instead of pushing out. */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-3 *:min-w-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("leading-tight font-semibold break-words", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />;
}

/** Actions at the bottom of a card. They wrap onto more lines; give text buttons `fullOnMobile`. */
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-wrap items-center gap-2 pt-1", className)} {...props} />;
}
