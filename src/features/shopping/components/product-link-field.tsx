import * as React from "react";
import { LinkIcon, SparklesIcon, Undo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { MoneyInput } from "./money-input";
import type { Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { fetchLinkPreview } from "../data/shopping-requests";
import { linkShopFor, mainShopLink, urlHost } from "../types/shop-links";
import { webUrlSchema, type LinkPreview, type Product } from "../types/shopping";

type ProductLinkFieldProps = {
  /** The product being edited: its main link (the default shop's, else the first) fills the field. */
  product?: Product;
  shops: Shop[];
  /** The form's "Usually bought at". */
  defaultShopId: string | null;
  /** A pasted URL of a known shop sets an empty default shop. */
  onDefaultShop: (shopId: string) => void;
  /** Fill empty fields of the form from the page (only the ones that are empty). */
  onFill: (fill: { name?: string; imageUrl?: string }) => void;
  /** Which of the form's fields are empty, so the offer only names those. */
  empty: { name: boolean; imageUrl: boolean };
  /** Reads a webshop page; defaults to the API (stories pass a fake). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Errors for `linkUrl` from the action. */
  errors?: string[];
};

/**
 * "Webshop link" in the product form: the product page at one shop, with an optional price. Pasting a URL reads
 * the page (name, photo, price) and offers to fill the empty fields; the URL's domain picks the shop (a known
 * shop becomes the default shop when there is none), else the link is the default shop's. Saved with the product
 * in the same submit (`linkUrl`, `linkShopId`, `linkPriceCents`); clearing it removes that shop's link
 * (`removeLinkShopId`) after a warning. Other shops' links stay (edited in the product's link menu).
 */
export function ProductLinkField({ product, shops, defaultShopId, onDefaultShop, onFill, empty, previewLink = fetchLinkPreview, errors }: ProductLinkFieldProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const initial = product ? mainShopLink(product.shopLinks, product.defaultShopId) : null;
  const [url, setUrl] = React.useState(initial?.url ?? "");
  const [priceCents, setPriceCents] = React.useState<number | null>(initial?.priceCents ?? null);
  const [priceKey, setPriceKey] = React.useState(0);
  const [preview, setPreview] = React.useState<{ url: string; result: LinkPreview | null } | null>(null);
  const [dismissed, setDismissed] = React.useState<string | null>(null);

  const trimmed = url.trim();
  const valid = Boolean(trimmed) && webUrlSchema.safeParse(trimmed).success;
  const target = valid ? linkShopFor(trimmed, shops, defaultShopId) : null;
  const shopName = (id: string | null | undefined) => shops.find((shop) => shop.id === id)?.name ?? null;
  const others = (product?.shopLinks ?? []).filter((link) => link.url && link.shopId !== (target?.shopId ?? initial?.shopId)).length;
  const removing = Boolean(initial?.url) && !trimmed;

  // A known shop's URL sets an empty default shop (once per URL).
  React.useEffect(() => {
    if (target?.setDefaultShop && target.shopId) onDefaultShop(target.shopId);
  }, [target?.setDefaultShop, target?.shopId, onDefaultShop]);

  // Read the page of a newly pasted URL (not the one the product already had).
  React.useEffect(() => {
    if (!valid || trimmed === (initial?.url ?? "")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreview({ url: trimmed, result: null });
      previewLink(trimmed)
        .then((result) => !cancelled && setPreview({ url: trimmed, result }))
        .catch(() => !cancelled && setPreview(null));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, valid, initial?.url, previewLink]);

  const found = preview?.url === trimmed ? preview.result : null;
  const loading = preview?.url === trimmed && preview.result === null;
  const fill = found && found.fetched && dismissed !== trimmed
    ? {
        name: empty.name && found.title ? found.title : undefined,
        imageUrl: empty.imageUrl && found.imageUrl ? found.imageUrl : undefined,
        priceCents: priceCents === null && found.priceCents !== null ? found.priceCents : undefined,
      }
    : null;
  const offers = fill && (fill.name || fill.imageUrl || fill.priceCents !== undefined);

  const apply = () => {
    if (!fill) return;
    onFill({ name: fill.name, imageUrl: fill.imageUrl });
    if (fill.priceCents !== undefined) {
      setPriceCents(fill.priceCents);
      setPriceKey((key) => key + 1);
    }
    setDismissed(trimmed);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <FormField
          label={t("productLink.label")}
          htmlFor="product-link-url"
          optionalLabel={tCommon("form.optional")}
          description={others ? t("productLink.others", { count: others }) : t("productLink.description")}
          errors={errors}
        >
          <Input
            id="product-link-url"
            name="linkUrl"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            autoComplete="off"
            className="text-base sm:text-sm"
          />
        </FormField>
        <FormField label={t("productLink.price")} htmlFor="product-link-price" optionalLabel={tCommon("form.optional")}>
          <MoneyInput key={priceKey} id="product-link-price" name="linkPriceCents" defaultValueCents={priceCents} onValueChange={setPriceCents} />
        </FormField>
      </div>
      <input type="hidden" name="linkShopId" value={target?.shopId ?? ""} />
      {removing && initial && <input type="hidden" name="removeLinkShopId" value={initial.shopId} />}

      <div aria-live="polite" className="flex flex-col gap-2">
        {valid && target && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LinkIcon className="size-4 shrink-0" aria-hidden="true" />
            {target.shopId
              ? target.matched
                ? t("productLink.forShop", { shop: shopName(target.shopId) ?? "?" })
                : t("productLink.forDefaultShop", { shop: shopName(target.shopId) ?? "?", host: urlHost(trimmed) ?? "" })
              : t("productLink.chooseShop")}
          </p>
        )}
        {loading && (
          <p className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("productLink.reading")}
          </p>
        )}
        {offers && fill && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center">
            {found?.imageUrl && <img src={found.imageUrl} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-md border bg-white object-contain p-0.5" />}
            <div className="flex min-w-0 flex-1 flex-col text-sm">
              <span className="font-medium break-words">{found?.title}</span>
              {found?.priceCents !== null && found?.priceCents !== undefined && <span className="text-muted-foreground tabular-nums">{formatCurrency(found.priceCents, locale)}</span>}
            </div>
            <Button type="button" fullOnMobile onClick={apply}>
              <SparklesIcon />
              {t("productLink.fill")}
            </Button>
          </div>
        )}
        {removing && initial && (
          <InlineAlert tone="warning">
            <span className="flex flex-col gap-2">
              {t("productLink.removing", { shop: shopName(initial.shopId) ?? "?" })}
              <Button type="button" variant="outline" fullOnMobile className="self-start" onClick={() => setUrl(initial.url ?? "")}>
                <Undo2Icon />
                {t("productLink.keep")}
              </Button>
            </span>
          </InlineAlert>
        )}
      </div>
    </div>
  );
}
