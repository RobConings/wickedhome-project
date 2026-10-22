import { ExternalLinkIcon, PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { productPath, type IngredientProduct } from "../types/recipes";

/** The product's photo as a small thumbnail (a package icon without one). 40 px, so it lines up with touch targets. */
export function IngredientThumbnail({ product, className }: { product: Pick<IngredientProduct, "imageUrl"> | null; className?: string }) {
  if (!product?.imageUrl) {
    return (
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", className)} aria-hidden="true">
        <PackageIcon className="size-4" />
      </span>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      className={cn("size-10 shrink-0 rounded-md border bg-white object-contain p-0.5", className)}
    />
  );
}

/** The linked product's name as a link to its page ("Product: BONI franse emmental"). */
export function IngredientProductLink({ product, className }: { product: Pick<IngredientProduct, "id" | "name">; className?: string }) {
  const { t } = useTranslation("recipes");
  return (
    <Link
      to={productPath(product.id)}
      className={cn("break-words text-primary underline-offset-4 hover:underline focus-visible:underline", className)}
      title={t("product.open", { name: product.name })}
    >
      {product.name}
    </Link>
  );
}

/** A 40 px icon button to the product's webshop page (the default shop's link, else the first), in a new tab. */
export function IngredientShopLink({ product }: { product: Pick<IngredientProduct, "name" | "shopLink"> }) {
  const { t } = useTranslation("recipes");
  if (!product.shopLink) return null;
  const label = t("product.webshop", { shop: product.shopLink.shopName, name: product.name });
  return (
    <Button asChild variant="ghost" size="icon-lg" className="shrink-0 text-muted-foreground">
      <a href={product.shopLink.url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
        <ExternalLinkIcon />
      </a>
    </Button>
  );
}
