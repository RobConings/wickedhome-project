import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { RecordLink } from "@/components/shared/record-link";
import type * as React from "react";
import { cn } from "@/lib/utils";
import type { Place } from "@/features/places";
import { useApplianceDeleting } from "../data/use-appliance-deleting";
import type { Appliance } from "../types/energy";
import { ApplianceActions } from "./appliance-actions";
import { ApplianceCategoryIcon } from "./appliance-category-icon";
import { ApplianceMarkers, ApplianceSummary } from "./appliance-markers";

type ApplianceRowProps = {
  appliance: Appliance;
  appliances?: Appliance[];
  /** Places for the edit dialog. */
  places: Place[];
  canManage: boolean;
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
export function ApplianceRow({ appliance, appliances, places, canManage, documents }: ApplianceRowProps) {
  const deleting = useApplianceDeleting(appliance.id);

  return (
    <div className={cn("flex items-center gap-3", deleting && "opacity-50")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
        <ApplianceCategoryIcon category={appliance.category} className="size-5" />
      </span>
      <Stack gap="0.5" className="min-w-0 flex-1">
        <Inline gap="sm" align="center" wrap className="min-w-0">
          <RecordLink to={`/energy/appliances/${encodeURIComponent(appliance.id)}`} className="truncate font-medium hover:underline">{appliance.name}</RecordLink>
          <ApplianceMarkers appliance={appliance} />
        </Inline>
        <ApplianceSummary appliance={appliance} className="truncate" />
        {appliance.notes && <Text size="xs" tone="muted" className="line-clamp-1">{appliance.notes}</Text>}
      </Stack>
      <ApplianceActions appliances={appliances} appliance={appliance} places={places} canManage={canManage} documents={documents} />
    </div>
  );
}
