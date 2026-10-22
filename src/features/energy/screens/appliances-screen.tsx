import type * as React from "react";
import { PlugIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { useSamePagePending } from "@/lib/pending";
import { NO_PLACE_GROUP, PlaceBadge, placeGroupKey, placeGroupOrder, type Place } from "@/features/places";
import { ApplianceFormDialog } from "../components/appliance-form-dialog";
import { ApplianceRow } from "../components/appliance-row";
import { ApplianceTile } from "../components/appliance-tile";
import { EnergyNav } from "../components/energy-nav";
import type { Appliance } from "../types/energy";
import { CanManageProvider } from "@/lib/permissions";

type AppliancesScreenProps = {
  appliances: Appliance[];
  places: Place[];
  canManage: boolean;
  /**
   * Each appliance's documents (manuals, warranties), rendered by the route with the documents feature's
   * `DocumentAttachments`, so this screen doesn't depend on that feature. Opened from the row.
   */
  documents?: (appliance: Appliance) => React.ReactNode;
};

export function AppliancesScreen({ appliances, places, canManage, documents }: AppliancesScreenProps) {
  const { t } = useTranslation("energy");
  const pending = useSamePagePending();

  const addButton = canManage && (
    <ApplianceFormDialog
      places={places}
      trigger={
        <Button>
          <PlusIcon />
          {t("appliances.add")}
        </Button>
      }
    />
  );

  return (
    <CanManageProvider value={canManage}>
      <PageContainer>
        <PageHeader title={t("page.appliances.title")} description={t("page.appliances.description")} actions={addButton} />
        <EnergyNav />

        <GeneralList
          label={t("page.appliances.title")}
          items={appliances}
          getKey={(appliance) => appliance.id}
          renderRow={(appliance) => (
            <ApplianceRow appliance={appliance} places={places} documents={documents?.(appliance)} />
          )}
          renderTile={(appliance) => (
            <ApplianceTile appliance={appliance} places={places} documents={documents?.(appliance)} />
          )}
          search={{
            keys: (appliance) => [
              appliance.name,
              t(`categories.${appliance.category}`),
              appliance.place?.name,
              appliance.place?.floorName,
              appliance.notes,
            ],
          }}
          storageKey="appliances"
          defaultView="list"
          groupBy={(appliance) => placeGroupKey(appliance.place)}
          groupOrder={placeGroupOrder(appliances.map((appliance) => appliance.place))}
          renderGroupHeader={(key, list) => {
            const place = key === NO_PLACE_GROUP ? null : (list[0]?.place ?? null);
            return (
              <span className="flex flex-wrap items-center gap-2">
                {place ? <PlaceBadge place={place} floorName={place.floorName} /> : t("appliances.noPlace")}
                <span className="text-sm font-normal text-muted-foreground">{t("appliances.count", { count: list.length })}</span>
              </span>
            );
          }}
          pending={pending}
          emptyState={
            <EmptyState
              icon={PlugIcon}
              title={t("appliances.empty.title")}
              description={t("appliances.empty.description")}
              action={addButton}
            />
          }
        />
      </PageContainer>
    </CanManageProvider>
  );
}
