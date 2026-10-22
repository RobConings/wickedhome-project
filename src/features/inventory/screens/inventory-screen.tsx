import * as React from "react";
import { BoxIcon, CalendarClockIcon, PackageIcon, PencilIcon, PlusIcon, ScanBarcodeIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { StatTile } from "@/components/shared/stat-tile";
import { PlaceBadge } from "@/features/places";
import type { UseSelectionsOptions } from "@/lib/selections";
import { addDays, todayIn } from "@/types/dates";
import { StockItemFormDialog } from "../components/stock-item-form-dialog";
import { StockItemRow } from "../components/stock-item-row";
import { StockItemTile } from "../components/stock-item-tile";
import type { InventoryPageData } from "../data/inventory-loaders";
import { useStockActions } from "../data/use-stock-actions";
import { compareStock, type StockItem } from "../types/inventory";

type InventoryScreenProps = {
  data: InventoryPageData;
  /** Set up stock and minimums (adults, owners). Everyone uses and adds stock. */
  canManage: boolean;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; places?: UseSelectionsOptions["initial"] };
  /** Fixed "today" (stories). */
  today?: string;
};

const EXPIRY_WARNING_DAYS = 7;

/** Stock per place, low stock first, with quick −1 / +1 and a way into scanning. */
export function InventoryScreen({ data, canManage, initialSelections, today = todayIn() }: InventoryScreenProps) {
  const { t } = useTranslation("inventory");
  const { products, places } = data;
  const revalidator = useRevalidator();
  const onChanged = React.useCallback(() => revalidator.revalidate(), [revalidator]);
  const { adjust, isPending, show } = useStockActions({ onChanged });
  // Quick −1 / +1 show at once (also in the counts and the "low" section) while they are saved.
  const stock = data.stock.map(show).sort(compareStock);

  const low = stock.filter((item) => item.isLow);
  const expiringBy = addDays(today, EXPIRY_WARNING_DAYS);
  const expiring = stock.filter((item) => item.expiresOn && item.expiresOn <= expiringBy);
  const placesById = new Map(places.map((place) => [place.id, place]));

  const onAdjust = (item: StockItem, delta: number) => void adjust(item, delta, delta < 0 ? "scan_use" : "scan_add");

  const editButton = (item: StockItem) =>
    canManage && (
      <StockItemFormDialog
        stockItem={item}
        products={products}
        places={places}
        initialSelections={initialSelections}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit", { name: item.productName })} title={t("actions.edit", { name: item.productName })}>
            <PencilIcon />
          </Button>
        }
      />
    );

  const addButton = canManage && (
    <StockItemFormDialog
      products={products}
      places={places}
      initialSelections={initialSelections}
      trigger={
        <Button variant="outline">
          <PlusIcon />
          {t("actions.add")}
        </Button>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/shopping/products">
                <PackageIcon />
                {t("actions.products")}
              </Link>
            </Button>
            {addButton}
            <Button asChild>
              <Link to="/inventory/scan">
                <ScanBarcodeIcon />
                {t("actions.scan")}
              </Link>
            </Button>
          </>
        }
      />

      <Stack gap="lg">
        {stock.length > 0 && (
          <>
            <PageGrid columns="stats">
              <StatTile label={t("stats.tracked")} value={stock.length} icon={BoxIcon} tone="featured" />
              <StatTile label={t("stats.low")} value={low.length} icon={TriangleAlertIcon} tone={low.length > 0 ? "warning" : "positive"} />
              <StatTile label={t("stats.expiring")} value={expiring.length} icon={CalendarClockIcon} hint={t("stats.expiringHint", { count: EXPIRY_WARNING_DAYS })} tone={expiring.length > 0 ? "soon" : "default"} />
            </PageGrid>

            {low.length > 0 && (
              <PageSection aria-labelledby="stock-low">
                <SectionHeader id="stock-low" title={t("sections.low")} description={t("sections.lowDescription")} />
                <ul className="divide-y rounded-xl border border-warning/40 bg-card px-3 shadow-xs">
                  {low.map((item) => (
                    <StockItemRow key={item.id} item={item} pending={isPending(item.id)} onAdjust={onAdjust} actions={editButton(item)} />
                  ))}
                </ul>
              </PageSection>
            )}
          </>
        )}

        <GeneralList
          label={t("page.title")}
          items={stock}
          getKey={(item) => item.id}
          renderRow={(item) => (
            <StockItemRow
              as="div"
              item={item}
              showPlace={false}
              pending={isPending(item.id)}
              onAdjust={onAdjust}
              actions={editButton(item)}
            />
          )}
          renderTile={(item) => (
            <StockItemTile item={item} showPlace={false} pending={isPending(item.id)} onAdjust={onAdjust} actions={editButton(item)} />
          )}
          search={{ keys: (item) => [item.productName, item.placeName, item.unit] }}
          storageKey="inventory"
          defaultView="list"
          groupBy={(item) => item.placeId}
          groupOrder={places.map((place) => place.id)}
          groupColumns={2}
          renderGroupHeader={(placeId, items) => {
            const place = placesById.get(placeId);
            if (!place) return items[0]?.placeName ?? placeId;
            return (
              <Link to={`/places/${encodeURIComponent(place.id)}`} className="hover:underline">
                <PlaceBadge place={place} floorName={place.floorName} className="text-sm" />
              </Link>
            );
          }}
          emptyState={<EmptyState icon={BoxIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />}
        />
      </Stack>
    </PageContainer>
  );
}
