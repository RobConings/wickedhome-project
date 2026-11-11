import type { ReactNode } from "react";
import { ChefHatIcon, type LucideIcon } from "lucide-react";
import { RecordImage } from "@/components/shared/record-image";
import { RecordLink } from "@/components/shared/record-link";
import { cn } from "@/lib/utils";

/** Missing and failed covers reserve the same banner space as a photo. */
export function RecipeCardCover({ src }: { src: string | null }) {
  return <RecordImage src={src} className="aspect-video w-full rounded-none" fallback={<ChefHatIcon className="size-10 text-section" aria-hidden="true" />} />;
}

/** Two reserved lines, at most 64 visible characters; the full name stays accessible. */
export function RecipeCardTitle({ name, to, stretched = false }: { name: string; to: string; stretched?: boolean }) {
  const characters = Array.from(name);
  const title = characters.length > 64 ? `${characters.slice(0, 63).join("").trimEnd()}…` : name;
  return <RecordLink to={to} title={name} aria-label={name} className={cn("block h-12 line-clamp-2 text-base leading-6 font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:underline", stretched && "after:absolute after:inset-0")}>{title}</RecordLink>;
}

/** The icon and value stay compact while assistive technology receives the full fact. */
export function RecipeCardStat({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums" title={label}><Icon className="size-3.5 shrink-0" aria-hidden="true" /><span aria-hidden="true">{children}</span><span className="sr-only">{label}</span></span>;
}
