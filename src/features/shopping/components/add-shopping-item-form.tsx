import * as React from "react";
import { Link2Icon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ShopPicker, type Shop } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import { fetchLinkPreview } from "../data/shopping-requests";
import type { LinkPreview, Product, ShoppingItemCreateInput } from "../types/shopping";
import { ProductPicker } from "./product-picker";

export type AddShoppingItemInput = Pick<
  ShoppingItemCreateInput,
  "name" | "productId" | "quantity" | "unit" | "shopId" | "url"
>;

type AddShoppingItemFormProps = {
  products: Product[];
  shops: Shop[];
  /** Products and shops are still loading (embedded forms load them themselves): the pickers show placeholders. */
  catalogLoading?: boolean;
  /** Saves the item; the form resets when it resolves. */
  onAdd: (input: AddShoppingItemInput) => Promise<void>;
  /** The shop is fixed (e.g. on a shop's page): no shop picker, every item gets this shop. */
  fixedShopId?: string;
  /** Reads a pasted webshop link; defaults to the API (stories pass a fake). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Seed picker favourites (stories). */
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
  autoFocus?: boolean;
  className?: string;
};

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Add an item by typing a name, choosing a product from the catalogue, or pasting a webshop link (its
 * title, image, price and shop are filled in from the page). Quantity, unit and shop are optional.
 */
export function AddShoppingItemForm({
  products,
  shops,
  catalogLoading = false,
  onAdd,
  fixedShopId,
  previewLink = fetchLinkPreview,
  initialSelections,
  autoFocus,
  className,
}: AddShoppingItemFormProps) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const idPrefix = React.useId();
  const [text, setText] = React.useState("");
  const [productId, setProductId] = React.useState<string | null>(null);
  const [shopId, setShopId] = React.useState<string | null>(fixedShopId ?? null);
  const [shopTouched, setShopTouched] = React.useState(false);
  const [quantity, setQuantity] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [preview, setPreview] = React.useState<LinkPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);

  const trimmed = text.trim();
  const isUrl = URL_PATTERN.test(trimmed);

  // Read a pasted link once it stops changing.
  React.useEffect(() => {
    if (!isUrl || preview?.url === trimmed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      previewLink(trimmed)
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          if (result.shopId && !shopTouched && !fixedShopId) setShopId(result.shopId);
        })
        .catch(() => undefined)
        .finally(() => setPreviewing(false));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isUrl, trimmed, preview?.url, previewLink, shopTouched, fixedShopId]);

  function chooseProduct(id: string | null) {
    setProductId(id);
    const product = products.find((candidate) => candidate.id === id);
    if (!product) return;
    if (!trimmed || products.some((candidate) => candidate.name === trimmed)) setText(product.name);
    if (!unit && product.unit) setUnit(product.unit);
    if (!shopTouched && !fixedShopId && product.defaultShopId) setShopId(product.defaultShopId);
  }

  function reset() {
    setText("");
    setProductId(null);
    setShopId(fixedShopId ?? null);
    setShopTouched(false);
    setQuantity("");
    setUnit("");
    setPreview(null);
    setFormKey((value) => value + 1);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed && !productId) return;
    const parsedQuantity = Number(quantity.replace(",", "."));
    const input: AddShoppingItemInput = {
      name: isUrl ? (preview?.title ?? undefined) : trimmed || undefined,
      url: isUrl ? trimmed : undefined,
      productId: productId ?? undefined,
      quantity: quantity && parsedQuantity > 0 ? parsedQuantity : undefined,
      unit: unit.trim() || undefined,
      shopId: shopId ?? undefined,
    };
    setSubmitting(true);
    try {
      await onAdd(input);
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      aria-busy={submitting || undefined}
      className={cn("flex flex-col gap-2", className)}
      noValidate
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          {isUrl && (
            <Link2Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          )}
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("add.placeholder")}
            aria-label={t("add.label")}
            autoComplete="off"
            autoFocus={autoFocus}
            // Read-only rather than disabled while saving, so the keyboard stays open for the next item.
            readOnly={submitting}
            enterKeyHint="done"
            className={cn("pointer-coarse:h-11 pointer-coarse:text-base", isUrl && "pl-9")}
          />
        </div>
        <Button type="submit" loading={submitting} disabled={!trimmed && !productId} className="pointer-coarse:h-11">
          <PlusIcon />
          <span className="max-sm:sr-only">{submitting ? t("add.adding") : t("add.submit")}</span>
        </Button>
      </div>

      {isUrl && (previewing || preview) && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-2 text-sm" aria-live="polite">
          {previewing ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Spinner />
              {t("add.previewing")}
            </span>
          ) : preview ? (
            <>
              {preview.imageUrl && (
                <img src={preview.imageUrl} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded border bg-white object-contain" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{preview.fetched ? preview.title : t("add.previewFailed")}</span>
                {preview.priceCents !== null && (
                  <span className="text-muted-foreground tabular-nums">{formatCurrency(preview.priceCents, locale)}</span>
                )}
              </span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("add.clearLink")} onClick={reset}>
                <XIcon />
              </Button>
            </>
          ) : null}
        </div>
      )}

      <div
        key={formKey}
        className={cn("grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_5rem]", fixedShopId && "sm:grid-cols-[minmax(0,1fr)_5rem_5rem]")}
      >
        <ProductPicker
          products={products}
          value={productId}
          onChange={chooseProduct}
          clearable
          loading={catalogLoading}
          disabled={submitting}
          initialSelections={initialSelections?.products}
          placeholder={t("add.fromCatalogue")}
        />
        {!fixedShopId && (
          <ShopPicker
            shops={shops}
            value={shopId}
            onChange={(id) => {
              setShopId(id);
              setShopTouched(true);
            }}
            clearable
            loading={catalogLoading}
            disabled={submitting}
            initialSelections={initialSelections?.shops}
            placeholder={t("add.shop")}
          />
        )}
        <Input
          id={`${idPrefix}-quantity`}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          disabled={submitting}
          placeholder="1"
          aria-label={t("fields.quantity")}
          className="tabular-nums"
        />
        <Input
          id={`${idPrefix}-unit`}
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          placeholder={t("fields.unitPlaceholder")}
          disabled={submitting}
          aria-label={t("fields.unit")}
          autoComplete="off"
        />
      </div>
    </form>
  );
}
