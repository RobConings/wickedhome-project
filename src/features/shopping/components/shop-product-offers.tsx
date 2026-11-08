import { ExternalLinkIcon, PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { GeneralList } from "@/components/shared/general-list";
import { RecordImage } from "@/components/shared/record-image";
import { RecordLink } from "@/components/shared/record-link";
import { currentLocale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchProducts } from "../data/shopping-requests";
import type { Product } from "../types/shopping";

/** Recorded catalogue relationships, never a claim of live availability or price. */
export function ShopProductOffers({ shopId, initialData }: { shopId: string; initialData?: Product[] }) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const { data, error, loading, refresh } = useAsyncResource(`shop-products:${shopId}`, () => fetchProducts({ shopId }), { initial: initialData });
  const content = (product: Product) => {
    const offer = product.shopLinks.find((link) => link.shopId === shopId);
    const url = offer?.url && /^https?:\/\//i.test(offer.url) ? offer.url : null;
    const packageLabel = product.packageAmount !== null && product.packageUnit ? `${product.packageAmount} ${product.packageUnit}` : product.unit;
    return <>
      <RecordImage src={product.imageUrl} shape="avatar" fit="contain" fallback={<PackageIcon className="size-7" />} />
      <div className="min-w-0 flex-1 space-y-1">
        <RecordLink to={`/inventory/products/${encodeURIComponent(product.id)}`} className="font-medium break-words text-primary hover:underline">{product.name}</RecordLink>
        {(product.brand || packageLabel) && <p className="text-sm break-words text-muted-foreground">{[product.brand, packageLabel].filter(Boolean).join(" · ")}</p>}
        {offer?.articleNumber && <p className="text-xs break-all text-muted-foreground">{t("shopOffers.article", { number: offer.articleNumber })}</p>}
        <p className="text-sm">{offer?.priceCents == null ? t("shopOffers.unknownPrice") : t("shopOffers.price", { price: formatCurrency(offer.priceCents, locale) })}</p>
        {product.defaultShopId === shopId && <p className="text-xs text-muted-foreground">{t("shopOffers.preferred")}</p>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline"><ExternalLinkIcon className="size-4 shrink-0" />{t("shopOffers.open")}</a>}
      </div>
    </>;
  };
  return <Card tone="section">
    <div><CardTitle>{t("shopOffers.title")}</CardTitle><CardDescription>{t("shopOffers.description")}</CardDescription></div>
    <GeneralList label={t("shopOffers.title")} items={data ?? []} getKey={(product) => product.id}
      search={{ param: "offersQ", keys: (product) => [product.name, product.brand, product.shopLinks.find((link) => link.shopId === shopId)?.articleNumber], label: t("shopOffers.search"), placeholder: t("shopOffers.search") }}
      renderRow={(product) => <div className="flex items-start gap-3">{content(product)}</div>}
      renderTile={(product) => <Card className="flex-row items-start gap-3">{content(product)}</Card>}
      loading={loading} skeletonCount={2} error={error || undefined} onRetry={refresh}
      emptyState={<p className="text-sm text-muted-foreground">{t("shopOffers.empty")}</p>} />
  </Card>;
}
