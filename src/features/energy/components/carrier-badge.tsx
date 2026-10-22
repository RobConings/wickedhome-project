import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EnergyCarrier } from "../types/energy";
import { CARRIER_ICONS } from "./carrier-icons";

/** What an appliance or meter runs on: electricity, gas or water, with an icon and its name. */
export function CarrierBadge({ carrier, className }: { carrier: EnergyCarrier; className?: string }) {
  const { t } = useTranslation("energy");
  const Icon = CARRIER_ICONS[carrier];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Icon aria-hidden="true" />
      {t(`carriers.${carrier}`)}
    </Badge>
  );
}
