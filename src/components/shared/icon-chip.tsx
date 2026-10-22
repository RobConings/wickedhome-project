import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { isSectionAccent, SECTION_ACCENTS, type SectionAccent } from "@/lib/section-accent";
import { cn } from "@/lib/utils";

const SECTION = "bg-section-soft text-section";

const iconChipVariants = cva("grid shrink-0 place-items-center rounded-lg [&_svg]:shrink-0", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      // The current section's colour (`data-accent` on the page), so a chip matches the page it is on.
      primary: SECTION,
      // Always the brand mint, whatever the section.
      brand: "bg-accent text-accent-foreground",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      info: "bg-info-soft text-info",
      danger: "bg-danger-soft text-danger",
      highlight: "bg-highlight text-highlight-foreground",
      // A named section (e.g. a dashboard row about tasks): the chip sets its own `data-accent`.
      ...(Object.fromEntries(SECTION_ACCENTS.map((accent) => [accent, SECTION])) as Record<SectionAccent, string>),
    },
    size: {
      sm: "size-8 [&_svg]:size-4",
      md: "size-10 [&_svg]:size-5",
    },
  },
  defaultVariants: { tone: "primary", size: "md" },
});

export type IconChipTone = NonNullable<VariantProps<typeof iconChipVariants>["tone"]>;

type IconChipProps = VariantProps<typeof iconChipVariants> & {
  icon?: LucideIcon;
  /** A ready-made icon element instead of `icon`. */
  children?: React.ReactNode;
  className?: string;
};

/** An icon on a soft coloured tile, to make a row, a figure or an action recognisable at a glance. Decorative. */
export function IconChip({ icon: Icon, children, tone, size, className }: IconChipProps) {
  return (
    <span
      data-accent={isSectionAccent(tone) ? tone : undefined}
      className={cn(iconChipVariants({ tone, size }), className)}
      aria-hidden="true"
    >
      {Icon ? <Icon /> : children}
    </span>
  );
}
