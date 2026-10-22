import { cn } from "@/lib/utils";

type ContactAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: "size-6 text-[10px]", md: "size-10 text-sm", lg: "size-12 text-base" } as const;

/** "Bouwbedrijf Peeters" → "BP"; "Jan" → "J". */
const contactInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/** The contact's initials in a round chip (decorative: the name is always shown next to it). */
export function ContactAvatar({ name, size = "md", className }: ContactAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", SIZES[size], className)}
    >
      {contactInitials(name)}
    </span>
  );
}
