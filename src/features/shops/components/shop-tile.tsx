import { ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Inline } from "./inline";
import { Card } from "./card";
import { FavoriteToggle } from "./favorite-toggle";
import type { Shop } from "../types/shops";
import { ShopLogo } from "./shop-logo";
import { ShopMarkers } from "./shop-markers";

type ShopTileProps = {
  shop: Shop;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
};

/** A shop as a tile (two per row on a phone): logo, name linking to the shop, markers, website and star. */
export function ShopTile({ shop, isFavorite, onToggleFavorite }: ShopTileProps) {
  const { t } = useTranslation("shops");
  return (
    <Card className="gap-3 p-4">
      <Inline justify="between" align="start">
        <ShopLogo shop={shop} size="lg" />
        <Inline gap="none" className="-mt-1 -mr-1">
          {shop.websiteUrl && (
            <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
              <a
                href={shop.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("actions.visitWebsite")}
                title={t("actions.visitWebsite")}
              >
                <ExternalLinkIcon />
              </a>
            </Button>
          )}
          <FavoriteToggle
            active={isFavorite}
            label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: shop.name })}
            onToggle={() => onToggleFavorite(shop.id)}
          />
        </Inline>
      </Inline>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          to={`/shops/${shop.id}`}
          className="line-clamp-2 font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {shop.name}
        </Link>
        <ShopMarkers shop={shop} />
      </div>
    </Card>
  );
}
