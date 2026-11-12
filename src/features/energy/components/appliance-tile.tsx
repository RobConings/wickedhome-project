import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { RecordLink } from "@/components/shared/record-link";
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
  appliances?: Appliance[];
  /** Places for the edit dialog. */
  places: Place[];
  canManage: boolean;
  /** The appliance's documents (rendered by the route), behind a paperclip button, for every role. */
  documents?: React.ReactNode;
};

/** An appliance as a tile (two per row on a phone): icon, name, badges, power figures and actions. */
export function ApplianceTile({ appliance, appliances, places, canManage, documents }: ApplianceTileProps) {
  const deleting = useApplianceDeleting(appliance.id);

  return (
    <Card className={cn("gap-3 p-4", deleting && "opacity-50")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
        <ApplianceCategoryIcon category={appliance.category} className="size-5" />
      </span>
      <Stack gap="1.5" className="min-w-0">
        <RecordLink to={`/energy/appliances/${encodeURIComponent(appliance.id)}`} className="line-clamp-2 font-medium break-words hover:underline">{appliance.name}</RecordLink>
        <Inline gap="1.5" align="stretch" wrap>
          <ApplianceMarkers appliance={appliance} />
        </Inline>
        <ApplianceSummary appliance={appliance} className="text-xs" />
        {appliance.notes && <Text size="xs" tone="muted" className="line-clamp-2">{appliance.notes}</Text>}
      </Stack>
      <ApplianceActions
        appliances={appliances}
        appliance={appliance}
        places={places}
        canManage={canManage}
        documents={documents}
        className="mt-auto -mb-1 -ml-2"
      />
    </Card>
  );
}
