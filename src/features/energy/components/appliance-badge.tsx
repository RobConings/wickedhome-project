import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appliance } from "../types/energy";
import { ApplianceCategoryIcon } from "./appliance-category-icon";

type ApplianceBadgeProps = {
  appliance: Pick<Appliance, "name" | "category">;
  className?: string;
};

/** Compact appliance label for lists elsewhere (e.g. a task "descale the boiler"). */
export function ApplianceBadge({ appliance, className }: ApplianceBadgeProps) {
  return (
    <Badge variant="outline" className={cn("max-w-48 gap-1 font-normal", className)}>
      <ApplianceCategoryIcon category={appliance.category} className="size-3" />
      <span className="truncate">{appliance.name}</span>
    </Badge>
  );
}
