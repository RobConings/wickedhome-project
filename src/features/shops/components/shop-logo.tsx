import * as React from "react";
import { cn } from "@/lib/utils";
import type { Shop } from "../types/shops";
import { ShopTypeIcon } from "./shop-type-icon";

const SIZES = {
  sm: { tile: "size-5 rounded-[5px]", logo: "", fallback: "", icon: "size-3.5" },
  md: { tile: "size-10 rounded-lg", logo: "p-0.5", fallback: "bg-section-soft text-section", icon: "size-5" },
  lg: { tile: "size-12 rounded-xl", logo: "p-1", fallback: "bg-section-soft text-section", icon: "size-6" },
} as const;

export type ShopLogoSize = keyof typeof SIZES;

type ShopLogoProps = {
  /** `iconUrl` may be missing for shop references that don't carry it; the type icon shows then. */
  shop: Pick<Shop, "type"> & { iconUrl?: string | null };
  size?: ShopLogoSize;
  className?: string;
};

/**
 * The shop's logo (found automatically on its website) on a white rounded tile, so transparent logos stay
 * readable in dark mode. Falls back to the shop type icon when there is no logo or it fails to load.
 * Decorative: always show the shop name next to it.
 */
export function ShopLogo({ shop, size = "md", className }: ShopLogoProps) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  const styles = SIZES[size];
  const src = shop.iconUrl && shop.iconUrl !== failedUrl ? shop.iconUrl : null;

  if (src) {
    return (
      <span
        aria-hidden="true"
        data-slot="shop-logo"
        className={cn(
          "inline-grid shrink-0 place-items-center overflow-hidden border border-black/10 bg-white dark:border-transparent",
          styles.tile,
          styles.logo,
          className,
        )}
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(src)}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      data-slot="shop-logo"
      className={cn("inline-grid shrink-0 place-items-center", styles.tile, styles.fallback, className)}
    >
      <ShopTypeIcon type={shop.type} className={styles.icon} />
    </span>
  );
}
