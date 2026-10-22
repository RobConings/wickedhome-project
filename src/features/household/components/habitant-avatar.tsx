import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { Habitant } from "../types/household";

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

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
