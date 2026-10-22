import * as React from "react";
import { PlusIcon, StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { EmptyState } from "../components/empty-state";
import { GeneralList } from "../components/general-list";
import { PageHeader } from "../components/page-header";
import type { UseSelectionsOptions } from "@/lib/selections";
import { ShopFormDialog } from "../components/shop-form-dialog";
import { ShopListItem } from "../components/shop-list-item";
import { ShopTile } from "../components/shop-tile";
import { ShopTypeFilter } from "../components/shop-type-filter";
import { ShopTypeIcon } from "../components/shop-type-icon";
import { useShopSelections } from "../data/use-shop-selections";
import { SHOP_TYPES, type Shop, type ShopType } from "../types/shops";

type ShopsScreenProps = {
  shops: Shop[];
  /** Adults and owners add shops; children only look. */
  canAdd: boolean;
  /** Seed favourites instead of fetching them (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

const FAVORITES_GROUP = "favorites";
const GROUP_ORDER = [FAVORITES_GROUP, ...SHOP_TYPES];

export function ShopsScreen({ shops, canAdd, initialSelections }: ShopsScreenProps) {
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
