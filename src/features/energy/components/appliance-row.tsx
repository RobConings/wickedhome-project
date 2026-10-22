import type * as React from "react";
import { cn } from "@/lib/utils";
import type { Place } from "@/features/places";
import { useApplianceDeleting } from "../data/use-appliance-deleting";
import type { Appliance } from "../types/energy";
import { ApplianceActions } from "./appliance-actions";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { ApplianceMarkers, ApplianceSummary } from "./appliance-markers";
import { useCanManage } from "@/lib/permissions";

type ApplianceRowProps = {
  appliance: Appliance;
  /** Places for the edit dialog. */
  places: Place[];
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
  /**
   * The appliance's documents (manuals, warranties, receipts), rendered by the route (the documents
   * feature's `DocumentAttachments`). Shown in a dialog behind a paperclip button, for every role.
   */
  documents?: React.ReactNode;
};

/**
 * One appliance as a row of a list (content only; the list draws the dividers and padding): category icon,
 * name, power figures, whether it is measured, and actions.
 */
export function ApplianceRow({ appliance, places, canManage: canManageProp, documents }: ApplianceRowProps) {
  const canManage = useCanManage(canManageProp);
  const deleting = useApplianceDeleting(appliance.id);

  return (
    <div className={cn("flex items-center gap-3", deleting && "opacity-50")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
        <ApplianceCategoryIcon category={appliance.category} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{appliance.name}</span>
          <ApplianceMarkers appliance={appliance} />
        </div>
        <ApplianceSummary appliance={appliance} className="truncate" />
        {appliance.notes && <p className="line-clamp-1 text-xs text-muted-foreground">{appliance.notes}</p>}
      </div>
      <ApplianceActions appliance={appliance} places={places} canManage={canManage} documents={documents} />
    </div>
  );
}
