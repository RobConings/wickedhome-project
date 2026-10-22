import { DropletIcon, FlameIcon, ZapIcon, type LucideIcon } from "lucide-react";
import type { EnergyCarrier } from "../types/energy";

/** One icon per carrier, used wherever a carrier is shown. */
export const CARRIER_ICONS: Record<EnergyCarrier, LucideIcon> = {
  electricity: ZapIcon,
  gas: FlameIcon,
  water: DropletIcon,
};
