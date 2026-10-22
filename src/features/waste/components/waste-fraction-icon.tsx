import {
  LeafIcon,
  NewspaperIcon,
  PackageIcon,
  RecycleIcon,
  ShirtIcon,
  SofaIcon,
  Trash2Icon,
  TreesIcon,
  WineIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WasteCollection, WasteFraction } from "../types/waste";

const ICONS: Record<WasteFraction, LucideIcon> = {
  residual: Trash2Icon,
  organic: LeafIcon,
  pmd: RecycleIcon,
  paper: NewspaperIcon,
  glass: WineIcon,
  textile: ShirtIcon,
  garden: TreesIcon,
  bulky: SofaIcon,
  other: PackageIcon,
};

/** The icon of a waste fraction. Decorative. */
export function WasteFractionIcon({ fraction, className }: { fraction: WasteFraction; className?: string }) {
  const Icon = ICONS[fraction];
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

/** A collection as a small pill: the fraction's icon on the provider's colour, and its label. */
export function WasteCollectionChip({ collection, className }: { collection: WasteCollection; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", className)}
      style={{
        borderColor: `color-mix(in oklab, ${collection.color} 45%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${collection.color} 14%, transparent)`,
      }}
      title={collection.note ?? undefined}
    >
      <span className="grid size-4 place-items-center rounded-full text-white" style={{ backgroundColor: collection.color }}>
        <WasteFractionIcon fraction={collection.fraction} className="size-2.5" />
      </span>
      {collection.label}
      {collection.note && <span className="text-muted-foreground">*</span>}
    </span>
  );
}
