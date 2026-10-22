import * as React from "react";
import {
  ArrowLeftIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PencilIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { PageSection } from "../components/page-section";
import { Stack } from "../components/stack";
import { Card, CardContent, CardTitle } from "../components/card";
import { ConfirmDialog } from "../components/confirm-dialog";
import { EmptyState } from "../components/empty-state";
import { FavoriteToggle } from "../components/favorite-toggle";
import { PageHeader } from "../components/page-header";
import { SectionHeader } from "../components/section-header";
import type { UseSelectionsOptions } from "@/lib/selections";
import { ShopFormDialog } from "../components/shop-form-dialog";
import { ShopIngredientSearchToggle } from "../components/shop-ingredient-search-toggle";
import { ShopLogo } from "../components/shop-logo";
import { ShopMarkers } from "../components/shop-markers";
import { ShopTypeBadge } from "../components/shop-type-badge";
import { ShopTypeIcon } from "../components/shop-type-icon";
import type { ShopActionResult } from "../data/shops-loaders";
import { useShopSelections } from "../data/use-shop-selections";
import type { Shop } from "../types/shops";

type ShopDetailScreenProps = {
  shop: Shop;
  canEdit: boolean;
  canDelete: boolean;
  /** Look for the shop's logo again (adults and owners, also for built-in shops). Defaults to `canEdit`. */
  canRefreshIcon?: boolean;
  /** Switch "Use for ingredient search" (adults and owners, also for built-in shops). Defaults to `canRefreshIcon`. */
  canSetIngredientSearch?: boolean;
  /**
   * Content of the "On the list here" section, filled by the route with the Shopping feature's items for
   * this shop. Shows an empty state when omitted.
   */
  shoppingItems?: React.ReactNode;
  /** Seed favourites instead of fetching them (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/** Strips the scheme and trailing slash for display: "https://www.colruyt.be/" → "www.colruyt.be". */
const displayUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export function ShopDetailScreen({
  shop,
  canEdit,
  canDelete,
  canRefreshIcon = canEdit,
  canSetIngredientSearch = canRefreshIcon,
  shoppingItems,
  initialSelections,
}: ShopDetailScreenProps) {
  const { t } = useTranslation("shops");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<ShopActionResult>();
  const iconFetcher = useFetcher<ShopActionResult>();
  const refreshingIcon = iconFetcher.state !== "idle";
  const { favoriteIds, toggleFavorite } = useShopSelections({ initial: initialSelections });
  const isFavorite = favoriteIds.includes(shop.id);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  React.useEffect(() => {
    if (iconFetcher.state !== "idle" || !iconFetcher.data) return;
    if (iconFetcher.data.ok) toast.success(t("icon.refreshed"));
    else if (iconFetcher.data.formError) toast.error(iconFetcher.data.formError);
  }, [iconFetcher.state, iconFetcher.data, t]);

  const actions = (
    <>
      <FavoriteToggle
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: shop.name })}
        className="border bg-background"
        onToggle={() => toggleFavorite(shop.id).catch(() => toast.error(t("favorite.failed")))}
      />
      {canEdit && (
        <ShopFormDialog
          shop={shop}
          trigger={
            <Button variant="outline">
              <PencilIcon />
              {tCommon("actions.edit")}
            </Button>
          }
        />
      )}
      {canDelete && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <Trash2Icon />
              {tCommon("actions.delete")}
            </Button>
          }
          title={t("delete.title", { name: shop.name })}
          description={t("delete.description")}
          confirmLabel={tCommon("actions.delete")}
          cancelLabel={tCommon("actions.cancel")}
          destructive
          onConfirm={() => fetcher.submit({ intent: "delete", id: shop.id }, { method: "post" })}
        />
      )}
    </>
  );

  const detailRow = (icon: React.ReactNode, label: string, value: string | null) => (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={value ? "whitespace-pre-line" : "text-muted-foreground"}>{value ?? t("detail.notSet")}</span>
      </div>
    </div>
  );

  return (
    <PageContainer>
      <Stack gap="md">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground">
          <Link to="/shops">
            <ArrowLeftIcon />
            {t("actions.backToShops")}
          </Link>
        </Button>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <ShopLogo shop={shop} size="lg" />
              <span className="min-w-0 break-words">{shop.name}</span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-1.5 pt-1">
              <ShopTypeBadge type={shop.type} />
              <ShopMarkers shop={shop} />
            </span>
          }
          actions={actions}
        />
      </Stack>

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg">
          <PageSection aria-labelledby="shop-on-the-list">
            <SectionHeader id="shop-on-the-list" title={t("detail.onTheList")} description={t("detail.onTheListDescription")} />
            {shoppingItems ?? <EmptyState icon={ShoppingCartIcon} title={t("detail.onTheListEmpty")} />}
          </PageSection>

          <Card>
            <CardTitle>{t("detail.notes")}</CardTitle>
            <p className={shop.notes ? "whitespace-pre-line" : "text-sm text-muted-foreground"}>
              {shop.notes ?? t("detail.noNotes")}
            </p>
          </Card>
        </Stack>

        <Stack gap="lg">
          <Card>
            <CardTitle>{t("detail.details")}</CardTitle>
            <CardContent className="text-sm">
              {detailRow(<ShopTypeIcon type={shop.type} />, t("fields.type"), t(`types.${shop.type}`))}
              {detailRow(<MapPinIcon />, t("fields.address"), shop.address)}
              {detailRow(<ClockIcon />, t("fields.openingHours"), shop.openingHours)}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>{t("detail.website")}</CardTitle>
            {shop.websiteUrl ? (
              <CardContent>
                <a
                  href={shop.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium break-all text-primary underline-offset-4 hover:underline"
                >
                  {displayUrl(shop.websiteUrl)}
                  <ExternalLinkIcon className="size-4 shrink-0" aria-hidden="true" />
                </a>
                {shop.hasWebshop && <p className="text-sm text-muted-foreground">{t("fields.hasWebshopDescription")}</p>}
                <div className="border-t pt-3">
                  <ShopIngredientSearchToggle shop={shop} canChange={canSetIngredientSearch} />
                </div>
                <div className="flex items-center gap-3 border-t pt-3" aria-busy={refreshingIcon || undefined}>
                  <ShopLogo shop={shop} size="md" className={refreshingIcon ? "animate-pulse" : undefined} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{t("icon.label")}</span>
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      {refreshingIcon ? t("icon.searching") : shop.iconUrl ? t("icon.auto") : t("icon.missing")}
                    </span>
                  </div>
                  {canRefreshIcon && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={refreshingIcon}
                      onClick={() => void iconFetcher.submit({ intent: "refresh-icon", id: shop.id }, { method: "post" })}
                    >
                      <RefreshCwIcon />
                      {refreshingIcon ? t("icon.refreshing") : t("icon.refresh")}
                    </Button>
                  )}
                </div>
              </CardContent>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.noWebsite")}</p>
            )}
          </Card>
        </Stack>
      </PageGrid>
    </PageContainer>
  );
}
