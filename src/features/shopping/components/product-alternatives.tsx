import * as React from "react";
import { Layers2Icon, LinkIcon, PlusIcon, UnlinkIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import type { Product, ProductAlternative } from "../types/shopping";
import { LinkAlternativeDialog } from "./link-alternative-dialog";
import { ProductCategoryIcon } from "./product-category-icon";

type ProductAlternativesProps = {
  product: Product;
  /** The catalogue: names of the main product and the products to link. */
  products: Product[];
  canManage: boolean;
  /** The alternative that was opened or scanned: highlighted. */
  highlightId?: string | null;
  /** Makes product names links, e.g. to their stock page. */
  productHref?: (productId: string) => string;
  /** Route to post to; defaults to the current route (its action handles `handleProductAlternativeForm`). */
  action?: string;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * The "Alternatives" of a product (content only; put it in a card or dialog): the products that share its
 * stock, each with an unlink button, and "Link an alternative". For an alternative itself: the main product
 * it shares stock with. Posts `link-alternative` / `unlink-alternative`.
 */
export function ProductAlternatives({ product, products, canManage, highlightId, productHref, action, initialSelections }: ProductAlternativesProps) {
  const { t } = useTranslation("shopping");
  const main = product.stockProductId ? products.find((candidate) => candidate.id === product.stockProductId) : undefined;
  const nameOf = (id: string, name: string) =>
    productHref ? (
      <Link to={productHref(id)} className="break-words underline-offset-4 hover:underline focus-visible:underline">
        {name}
      </Link>
    ) : (
      <span className="break-words">{name}</span>
    );

  if (product.stockProductId) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm">
          <Layers2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <Trans
              t={t}
              i18nKey="alternatives.sharesWithLink"
              values={{ name: main?.name ?? "…" }}
              components={{
                main:
                  productHref && main ? (
                    <Link to={productHref(main.id)} className="font-medium underline-offset-4 hover:underline focus-visible:underline" />
                  ) : (
                    <span className="font-medium" />
                  ),
              }}
            />
          </span>
        </p>
        {canManage && <UnlinkButton alternative={product} action={action} withLabel />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {product.alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("alternatives.none")}</p>
      ) : (
        <ul className="-my-1 divide-y">
          {product.alternatives.map((alternative) => (
            <li
              key={alternative.id}
              className={cn("flex items-center gap-3 py-2", alternative.id === highlightId && "-mx-2 rounded-lg bg-section-soft px-2")}
            >
              {alternative.imageUrl ? (
                <img src={alternative.imageUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-md border bg-white object-contain" />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <ProductCategoryIcon category={product.category} className="size-4" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                {nameOf(alternative.id, alternative.name)}
                {alternative.id === highlightId && (
                  <Badge variant="secondary" className="font-normal">
                    {t("alternatives.opened")}
                  </Badge>
                )}
              </span>
              {canManage && <UnlinkButton alternative={alternative} action={action} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <LinkAlternativeDialog
          product={product}
          products={products}
          action={action}
          initialSelections={initialSelections}
          trigger={
            <Button variant="outline" fullOnMobile className="sm:self-start">
              <PlusIcon />
              {t("alternatives.link")}
            </Button>
          }
        />
      )}
    </div>
  );
}

/** Takes one product out of its group (the stock stays with the main product), with a spinner while saving. */
function UnlinkButton({ alternative, action, withLabel = false }: { alternative: Pick<ProductAlternative, "id" | "name">; action?: string; withLabel?: boolean }) {
  const { t } = useTranslation("shopping");
  const fetcher = useFetcher<ShoppingActionResult>();
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const label = t("alternatives.unlink", { name: alternative.name });

  React.useEffect(() => {
    if (result?.ok) toast.success(t("alternatives.unlinked", { name: alternative.name }));
    else if (result?.formError) toast.error(result.formError);
  }, [result, alternative.name, t]);

  const submit = () => void fetcher.submit({ intent: "unlink-alternative", id: alternative.id }, { method: "post", action });
  return withLabel ? (
    <Button variant="outline" fullOnMobile loading={fetcher.state !== "idle"} onClick={submit}>
      <UnlinkIcon />
      {label}
    </Button>
  ) : (
    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={label} title={label} loading={fetcher.state !== "idle"} onClick={submit}>
      <UnlinkIcon />
    </Button>
  );
}

/** A small "Shared stock" badge for a product in a group of alternatives (lists, tiles); null otherwise. */
export function SharedStockBadge({ product, products, className }: { product: Product; products?: Product[]; className?: string }) {
  const { t } = useTranslation("shopping");
  if (!product.stockProductId && product.alternatives.length === 0) return null;
  const main = product.stockProductId ? products?.find((candidate) => candidate.id === product.stockProductId) : undefined;
  const names = product.stockProductId ? (main?.name ?? "") : product.alternatives.map((alternative) => alternative.name).join(", ");
  return (
    <Badge variant="outline" className={cn("max-w-full gap-1 font-normal", className)} title={names ? t("alternatives.badgeTitle", { names }) : undefined}>
      <LinkIcon aria-hidden="true" />
      <span className="truncate">{t("alternatives.badge")}</span>
    </Badge>
  );
}
