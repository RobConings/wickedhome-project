import {
  AppleIcon,
  BabyIcon,
  BathIcon,
  BeefIcon,
  CroissantIcon,
  CupSodaIcon,
  HammerIcon,
  MilkIcon,
  PackageIcon,
  PawPrintIcon,
  PillIcon,
  SnowflakeIcon,
  SprayCanIcon,
  SproutIcon,
  WheatIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "../types/shopping";

const ICONS: Record<ProductCategory, LucideIcon> = {
  produce: AppleIcon,
  bakery: CroissantIcon,
  dairy: MilkIcon,
  meat_fish: BeefIcon,
  pantry: WheatIcon,
  frozen: SnowflakeIcon,
  drinks: CupSodaIcon,
  household: SprayCanIcon,
  personal_care: BathIcon,
  baby: BabyIcon,
  pets: PawPrintIcon,
  pharmacy: PillIcon,
  diy: HammerIcon,
  garden: SproutIcon,
  other: PackageIcon,
};

/** The icon for a product category (fruit & veg, dairy, DIY…). Decorative. */
export function ProductCategoryIcon({ category, className }: { category: ProductCategory; className?: string }) {
  const Icon = ICONS[category];
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}
