import {
  CarFrontIcon,
  CookingPotIcon,
  FanIcon,
  FlameIcon,
  HammerIcon,
  LightbulbIcon,
  MonitorIcon,
  PlugIcon,
  RefrigeratorIcon,
  UtensilsCrossedIcon,
  WashingMachineIcon,
  WavesIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplianceCategory } from "../types/energy";

const CATEGORY_ICONS: Record<ApplianceCategory, LucideIcon> = {
  heating: FlameIcon,
  heat_pump: FanIcon,
  cooking: CookingPotIcon,
  laundry: WashingMachineIcon,
  dishwasher: UtensilsCrossedIcon,
  cold: RefrigeratorIcon,
  jacuzzi_pool: WavesIcon,
  ev_charger: CarFrontIcon,
  it_media: MonitorIcon,
  lighting: LightbulbIcon,
  tools: HammerIcon,
  other: PlugIcon,
};

/** The icon of an appliance category. Decorative: always pair it with the category or appliance name. */
export function ApplianceCategoryIcon({ category, className }: { category: ApplianceCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}
