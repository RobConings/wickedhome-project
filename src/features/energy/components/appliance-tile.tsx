import type * as React from "react";
import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import type { Place } from "@/features/places";
import { useApplianceDeleting } from "../data/use-appliance-deleting";
import type { Appliance } from "../types/energy";
import { ApplianceActions } from "./appliance-actions";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { ApplianceMarkers, ApplianceSummary } from "./appliance-markers";

type ApplianceTileProps = {
  appliance: Appliance;
  /** Places for the edit dialog. */
  places: Place[];
  canManage: boolean;
  /** The appliance's documents (rendered by the route), behind a paperclip button, for every role. */
  documents?: React.ReactNode;
};

/** An appliance as a tile (two per row on a phone): icon, name, badges, power figures and actions. */
export function ApplianceTile({ appliance, places, canManage, documents }: ApplianceTileProps) {
  const deleting = useApplianceDeleting(appliance.id);

  return (
    <Card className={cn("gap-3 p-4", deleting && "opacity-50")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
        <ApplianceCategoryIcon category={appliance.category} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="line-clamp-2 font-medium break-words">{appliance.name}</span>
        <div className="flex flex-wrap gap-1.5">
          <ApplianceMarkers appliance={appliance} />
        </div>
        <ApplianceSummary appliance={appliance} className="text-xs" />
        {appliance.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{appliance.notes}</p>}
      </div>
      <ApplianceActions
        appliance={appliance}
        places={places}
        canManage={canManage}
        documents={documents}
        className="mt-auto -mb-1 -ml-2"
      />
    </Card>
  );
}
