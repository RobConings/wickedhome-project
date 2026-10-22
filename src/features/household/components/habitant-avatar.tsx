import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { Habitant } from "../types/household";
import { initials } from "@/lib/format";

const avatarVariants = cva(
  "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-background select-none",
  {
    variants: {
      size: {
        sm: "size-7 text-xs",
        md: "size-10 text-sm",
        lg: "size-14 text-xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type HabitantAvatarProps = VariantProps<typeof avatarVariants> & {
  habitant: Pick<Habitant, "name" | "color" | "emoji">;
  className?: string;
};

/** A habitant's colour with their emoji, or their initials when they have none. */
export function HabitantAvatar({ habitant, size, className }: HabitantAvatarProps) {
  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      style={{ backgroundColor: habitant.color }}
      title={habitant.name}
      aria-hidden="true"
    >
      {habitant.emoji ? <span className="leading-none">{habitant.emoji}</span> : initials(habitant.name)}
    </span>
  );
}

type HabitantAvatarStackProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  habitants: readonly Habitant[];
  /** The wrapping element (`span` inline, `div` in a block layout). */
  as?: "span" | "div";
};

/** Small overlapping avatars of several habitants (who pays, who's on duty, who takes part). */
export function HabitantAvatarStack({ habitants, as: Element = "span", className, ...props }: HabitantAvatarStackProps) {
  return (
    <Element {...props} className={cn("flex shrink-0 -space-x-1.5", className)}>
      {habitants.map((habitant) => (
        <HabitantAvatar key={habitant.id} habitant={habitant} size="sm" />
      ))}
    </Element>
  );
}
