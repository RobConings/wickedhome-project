import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ScrollRow } from "@/components/layout/scroll-row";
import { cn } from "@/lib/utils";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Form field name; the control then submits with native forms. Generated when omitted. */
  name?: string;
  /** `lg` makes the whole control 40 px tall: a full touch target, next to 40 px inputs. */
  size?: "sm" | "default" | "lg";
  /** Show only the icons (labels stay available to screen readers and as tooltips). */
  iconOnly?: boolean;
  className?: string;
};

/**
 * Pick one of a few options shown side by side, e.g. a view switch (Month / Week / Agenda). Built on radio
 * inputs, so arrow keys and forms work natively.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
  size = "default",
  iconOnly = false,
  className,
}: SegmentedControlProps<T>) {
  const generatedName = React.useId();
  return (
    // A `ScrollRow`: with many options on a narrow screen it scrolls sideways inside itself (the radios are
    // focusable, and arrow keys scroll the checked one into view) instead of widening the page.
    <ScrollRow
      role="radiogroup"
      aria-label={label}
      focusable={false}
      gap="xs"
      className={cn("inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-muted-foreground", className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <label key={option.value} className="relative" title={iconOnly ? option.label : undefined}>
            <input
              type="radio"
              name={name ?? generatedName}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none",
                // Selected: a raised chip with a hairline and the icon in the current section's colour.
                "hover:text-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-xs peer-checked:ring-1 peer-checked:ring-section-border peer-checked:[&_svg]:text-section dark:peer-checked:bg-elevated",
                "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                size === "sm" && "h-7 px-2.5 text-xs [&_svg]:size-3.5",
                size === "default" && "h-8 px-3 text-sm [&_svg]:size-4",
                size === "lg" && "h-9 min-w-10 px-3 text-sm [&_svg]:size-4",
              )}
            >
              {Icon && <Icon aria-hidden="true" />}
              <span className={cn(iconOnly && "sr-only")}>{option.label}</span>
            </span>
          </label>
        );
      })}
    </ScrollRow>
  );
}
