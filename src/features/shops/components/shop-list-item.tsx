import { ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { FavoriteToggle } from "./favorite-toggle";
import type { Shop } from "../types/shops";
import { ShopMarkers } from "./shop-markers";
import { ShopLogo } from "./shop-logo";

type ShopListItemProps = {
  shop: Shop;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
};

/** One row in the shops list (the list draws the dividers): links to the shop, with markers, website and star. */
export function ShopListItem({ shop, isFavorite, onToggleFavorite }: ShopListItemProps) {
  const { t } = useTranslation("shops");
  return (
    <div className="flex items-center gap-3">
      <ShopLogo shop={shop} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/shops/${shop.id}`}
          className="truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {shop.name}
        </Link>
        <ShopMarkers shop={shop} />
      </div>
      {shop.websiteUrl && (
        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
          <a href={shop.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={t("actions.visitWebsite")} title={t("actions.visitWebsite")}>
            <ExternalLinkIcon />
          </a>
        </Button>
      )}
      <FavoriteToggle
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: shop.name })}
        onToggle={() => onToggleFavorite(shop.id)}
      />
    </div>
  );
}
