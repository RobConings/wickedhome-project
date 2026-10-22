import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

type ContactAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: "size-6 text-[10px]", md: "size-10 text-sm", lg: "size-12 text-base" } as const;

/** The contact's initials in a round chip (decorative: the name is always shown next to it). */
export function ContactAvatar({ name, size = "md", className }: ContactAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", SIZES[size], className)}
    >
      {initials(name, { skipEmpty: true })}
    </span>
  );
}
