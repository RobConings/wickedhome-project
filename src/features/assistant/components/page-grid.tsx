import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Every variant is ONE column on phones (below `sm`, 640 px): cards, tiles and stat tiles stack full width
 * and use the vertical space (docs/ADDING-A-FEATURE.md, "Phone first"). Columns start at `sm` or later.
 * Grid children get `min-w-0`, so long content wraps instead of widening the page.
 */
const pageGridVariants = cva("grid min-w-0 grid-cols-1 gap-6 *:min-w-0", {
  variants: {
    columns: {
      "1": "",
      "2": "md:grid-cols-2",
      "3": "md:grid-cols-2 xl:grid-cols-3",
      /** Wide main column with a narrower sidebar column on large screens. */
      "main-sidebar": "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
      /** One per row on phones, then as many ~16rem cards per row as fit. */
      cards: "gap-4 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]",
      /** Compact tiles (GeneralList's tiles view): one per row on phones, then as many ~13rem tiles as fit. */
      tiles: "gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-4",
      /** A row of stat tiles: one per row on phones, two from `sm`, then as many ~12rem tiles as fit (no lonely last tile). */
      stats: "gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]",
      /** Exactly four stat tiles: one per row on phones, two from `sm`, four in a row from `lg`. */
      "stats-4": "gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4",
      /**
       * The one exception to "one column on phones": tiny square chips that are only an icon and a short
       * number or word (e.g. hourly forecast, a colour pick). Two per row on phones, more from `sm`.
       */
      chips: "grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]",
    },
  },
  defaultVariants: { columns: "1" },
});

type PageGridProps = React.ComponentProps<"div"> &
  VariantProps<typeof pageGridVariants> & {
    /** The element to render, e.g. a labelled `section` for a row of stat tiles. */
    as?: "div" | "section";
  };

/** Column structure of a page. Knows how many columns there are, never what is in them. */
export function PageGrid({ columns, as: Element = "div", className, ...props }: PageGridProps) {
  return <Element className={cn(pageGridVariants({ columns }), className)} {...props} />;
}
