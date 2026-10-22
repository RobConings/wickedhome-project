import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { IngredientStatus } from "../types/recipes";

const TONES: Record<IngredientStatus, string> = {
  in_stock: "bg-success",
  short: "bg-warning",
  not_kept: "bg-muted-foreground/40",
  unknown: "bg-muted-foreground/40",
  // The units don't convert (no content per package): a neutral ring, never a shortage.
  unknown_amount: "border-2 border-muted-foreground/60 bg-transparent",
};

/** A small dot with a hidden label: in stock (green), short (orange), unknown (grey: no product or not kept) or unknown amount (a ring: the units don't convert). */
export function IngredientStatusDot({ status, className }: { status: IngredientStatus; className?: string }) {
  const { t } = useTranslation("recipes");
  const label = t(`status.${status}`);
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", TONES[status], className)} title={label} role="img" aria-label={label} />;
}
