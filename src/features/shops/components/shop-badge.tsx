import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Shop } from "../types/shops";
import { ShopLogo } from "./shop-logo";

type ShopBadgeProps = {
  /** Pass `iconUrl` (as on `Shop`) to show the shop's logo; without it the type icon shows. */
  shop: Pick<Shop, "id" | "name" | "type"> & { iconUrl?: string | null };
  /** Link to the shop's page. */
  linked?: boolean;
  className?: string;
};

/** Compact shop label for lists elsewhere (e.g. "buy at Colruyt" on a shopping item). */
export function ShopBadge({ shop, linked = false, className }: ShopBadgeProps) {
  const content = (
    <>
      <ShopLogo shop={shop} size="sm" className="size-4 rounded-[4px]" />
      <span className="truncate">{shop.name}</span>
    </>
  );
  const classes = cn("max-w-48 gap-1 font-normal", className);
  return linked ? (
    <Badge asChild variant="outline" className={classes}>
      <Link to={`/shops/${shop.id}`}>{content}</Link>
    </Badge>
  ) : (
    <Badge variant="outline" className={classes}>
      {content}
    </Badge>
  );
}
