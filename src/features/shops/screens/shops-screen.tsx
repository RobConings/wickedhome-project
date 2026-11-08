import * as React from "react";
import { LayersIcon, PencilIcon, PlusIcon, StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import type { UseSelectionsOptions } from "@/lib/selections";
import { Card, CardTitle } from "@/components/shared/card";
import { RecordLink } from "@/components/shared/record-link";
import { ShopGroupFormDialog } from "../components/shop-group-form-dialog";
import { ShopFormDialog } from "../components/shop-form-dialog";
import { ShopListItem } from "../components/shop-list-item";
import { ShopTile } from "../components/shop-tile";
import { ShopTypeFilter } from "../components/shop-type-filter";
import { ShopTypeIcon } from "../components/shop-type-icon";
import { useShopSelections } from "../data/use-shop-selections";
import { SHOP_TYPES, type SavedShopGroup, type Shop, type ShopType } from "../types/shops";

type ShopsScreenProps = {
  shops: Shop[];
  groups?: SavedShopGroup[];
  /** Adults and owners add shops; children only look. */
  canAdd: boolean;
  /** Seed favourites instead of fetching them (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

const FAVORITES_GROUP = "favorites";
const GROUP_ORDER = [FAVORITES_GROUP, ...SHOP_TYPES];

export function ShopsScreen({ shops, groups = [], canAdd, initialSelections }: ShopsScreenProps) {
  const { t } = useTranslation("shops");
  const [type, setType] = React.useState<ShopType | null>(null);
  const { favoriteIds, toggleFavorite } = useShopSelections({ initial: initialSelections });

  const availableTypes = SHOP_TYPES.filter((option) => shops.some((shop) => shop.type === option));
  const visible = type ? shops.filter((shop) => shop.type === type) : shops;

  const handleToggleFavorite = (id: string) => toggleFavorite(id).catch(() => toast.error(t("favorite.failed")));

  const addButton = canAdd && (
    <ShopFormDialog
      defaultType={type ?? undefined}
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.add")}
        </Button>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={addButton} />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle><LayersIcon className="mr-2 inline size-5 text-section" />{t("groups.title")}</CardTitle>
          {canAdd && <ShopGroupFormDialog shops={shops} trigger={<Button variant="outline"><PlusIcon />{t("groups.add")}</Button>} />}
        </div>
        <p className="text-sm text-muted-foreground">{t("groups.description")}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <div key={group.id} className="flex min-w-0 items-center gap-2 rounded-xl border p-3">
          <RecordLink to={`/shopping/sessions?destination=${encodeURIComponent(`group:${group.id}`)}`} className="min-h-12 min-w-0 flex-1 rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
            <span className="block font-medium">{group.name}</span><span className="block text-sm text-muted-foreground">{group.shopIds.map((id) => shops.find((shop) => shop.id === id)?.name).filter(Boolean).join(" · ")}</span>
          </RecordLink>
          {canAdd && <ShopGroupFormDialog shops={shops} group={group} trigger={<Button variant="ghost" size="icon" aria-label={`${t("groups.edit")}: ${group.name}`}><PencilIcon /></Button>} />}
        </div>)}</div>
      </Card>
      <GeneralList
        label={t("page.title")}
        items={visible}
        getKey={(shop) => shop.id}
        renderRow={(shop) => (
          <ShopListItem shop={shop} isFavorite={favoriteIds.includes(shop.id)} onToggleFavorite={handleToggleFavorite} />
        )}
        renderTile={(shop) => (
          <ShopTile shop={shop} isFavorite={favoriteIds.includes(shop.id)} onToggleFavorite={handleToggleFavorite} />
        )}
        search={{ keys: ["name"], label: t("filter.search"), placeholder: t("filter.search") }}
        storageKey="shops"
        defaultView="list"
        toolbar={<ShopTypeFilter types={availableTypes} value={type} onChange={setType} />}
        filtered={type !== null}
        groupBy={(shop) => (favoriteIds.includes(shop.id) ? [FAVORITES_GROUP, shop.type] : shop.type)}
        groupOrder={GROUP_ORDER}
        groupColumns={2}
        renderGroupHeader={(key, list) =>
          key === FAVORITES_GROUP ? (
            t("filter.favorites")
          ) : (
            <span className="flex items-center gap-2">
              <ShopTypeIcon type={key as ShopType} className="size-5 text-primary" />
              {t(`types.${key as ShopType}`)}
              <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
            </span>
          )
        }
        emptyState={
          <EmptyState icon={StoreIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />
        }
      />
    </PageContainer>
  );
}
