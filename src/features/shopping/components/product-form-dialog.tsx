import * as React from "react";
import { ImageOffIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher, type FetcherWithComponents } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Stack } from "./stack";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { ShopPicker, type Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { useBarcodeAutofill } from "../data/use-barcode-autofill";
import { packageSizeOf, type BarcodeLookupResult, type ProductSuggestion } from "../types/barcode-lookup";
import { PACKAGE_UNITS, PRODUCT_CATEGORIES, type LinkPreview, type Product, type ProductCategory } from "../types/shopping";
import { ProductAlternatives } from "./product-alternatives";
import { ProductCategoryIcon } from "./product-category-icon";
import { ProductLinkField } from "./product-link-field";
import { ProductSuggestionCard } from "./product-suggestion-card";

type ProductFormDialogProps = {
  /** Edit this product; omit to add one. */
  product?: Product;
  shops: Shop[];
  /** Prefill a new product, e.g. the barcode that was just scanned. */
  defaults?: Partial<Pick<Product, "name" | "barcode" | "qrCode" | "category" | "unit" | "imageUrl">>;
  /** What the scanned barcode turned out to be: fills in name, category and photo (the user checks them). */
  suggestion?: ProductSuggestion | null;
  /** Looks up a typed barcode; defaults to the API (stories pass a fake). */
  lookup?: (code: string) => Promise<BarcodeLookupResult>;
  /** Reads a pasted webshop link; defaults to the API (stories pass a fake). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  trigger?: React.ReactElement;
  /** Controlled opening (e.g. opened by a scan instead of a trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called with the product id after it saved. */
  onSaved?: (productId: string) => void;
  initialSelections?: UseSelectionsOptions["initial"];
  /** The catalogue: when editing, shows the product's alternatives (shared stock) under the form. */
  products?: Product[];
};

/**
 * Add or edit a catalogue product. Posts `create-product` / `update-product` to the current route's
 * action; pages other than Products handle it with `handleProductForm`. Typing a valid barcode looks it up
 * and offers to fill in the rest.
 */
export function ProductFormDialog({
  product,
  shops,
  defaults,
  suggestion,
  lookup,
  previewLink,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  initialSelections,
  products,
}: ProductFormDialogProps) {
  const { t } = useTranslation("shopping");
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [session, setSession] = React.useState(0);
  const fetcher = useFetcher<ShoppingActionResult>({ key: `product-form-${product?.id ?? "new"}-${session}` });
  const result = fetcher.data;
  const saved = fetcher.state === "idle" && result?.ok === true;

  React.useEffect(() => {
    if (!saved) return;
    toast.success(product ? t("products.updated") : t("products.created"));
    if (result?.id) onSaved?.(result.id);
    onOpenChange?.(false);
    // Only once per save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  function setOpen(next: boolean) {
    // Stay open while saving, so a failed save can still show its errors.
    if (!next && fetcher.state !== "idle") return;
    if (next) setSession((value) => value + 1);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  // Opened from outside: start a fresh fetcher.
  const [seenOpen, setSeenOpen] = React.useState(open);
  if (seenOpen !== open) {
    setSeenOpen(open);
    if (open && controlledOpen !== undefined) setSession((value) => value + 1);
  }

  return (
    <Dialog open={open && !saved} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {/* Keyed by session: every opening starts from the product, the defaults and the suggestion again. */}
        <ProductForm
          key={session}
          fetcher={fetcher}
          product={product}
          shops={shops}
          defaults={defaults}
          suggestion={suggestion}
          lookup={lookup}
          previewLink={previewLink}
          initialSelections={initialSelections}
          onCancel={() => setOpen(false)}
        />
        {/* Outside the form: linking and unlinking save on their own. */}
        {product && products && (
          <section className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">{t("alternatives.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("alternatives.description")}</p>
            </div>
            <ProductAlternatives product={product} products={products} canManage />
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

const isStoredPhoto = (url: string) => url.startsWith("/api/");

type ProductFormProps = Pick<ProductFormDialogProps, "product" | "shops" | "defaults" | "suggestion" | "lookup" | "previewLink" | "initialSelections"> & {
  fetcher: FetcherWithComponents<ShoppingActionResult>;
  onCancel: () => void;
};

function ProductForm({ fetcher, product, shops, defaults, suggestion, lookup, previewLink, initialSelections, onCancel }: ProductFormProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const result = fetcher.data;
  const errors = result?.errors;
  const busy = fetcher.state !== "idle";
  const optional = tCommon("form.optional");

  const initialBarcode = product?.barcode ?? defaults?.barcode ?? "";
  const [name, setName] = React.useState(product?.name ?? suggestion?.productName ?? defaults?.name ?? "");
  const [category, setCategory] = React.useState<ProductCategory>(product?.category ?? suggestion?.category ?? defaults?.category ?? "other");
  const [imageUrl, setImageUrl] = React.useState(product?.imageUrl ?? suggestion?.imageUrl ?? defaults?.imageUrl ?? "");
  const [photoFailed, setPhotoFailed] = React.useState(false);
  // Content per package: the product's, else read from the scanned barcode's quantity ("6 x 33 cl" → 198 cl).
  const suggested = packageSizeOf(suggestion?.quantity);
  const [packageAmount, setPackageAmount] = React.useState(String(product?.packageAmount ?? suggested?.amount ?? ""));
  const [packageUnit, setPackageUnit] = React.useState(product?.packageUnit ?? suggested?.unit ?? "");
  const [barcode, setBarcode] = React.useState(initialBarcode);
  const [defaultShopId, setDefaultShopId] = React.useState<string | null>(product?.defaultShopId ?? null);
  const [isEssential, setIsEssential] = React.useState(product?.isEssential ?? false);
  // A pasted link of a known shop fills an empty "Usually bought at".
  const setDefaultShopFromLink = React.useCallback((shopId: string) => setDefaultShopId((current) => current ?? shopId), []);
  /** The code whose details were filled in (from the scan or with "Fill in"): not offered again. */
  const [filledFrom, setFilledFrom] = React.useState<string | null>(suggestion ? initialBarcode : null);

  const autofill = useBarcodeAutofill(barcode, {
    lookup,
    skip: (code) => code === product?.barcode || code === filledFrom,
  });

  function applySuggestion(next: ProductSuggestion, code: string) {
    setName(next.productName);
    if (next.category) setCategory(next.category);
    if (next.imageUrl) {
      setImageUrl(next.imageUrl);
      setPhotoFailed(false);
    }
    const size = packageSizeOf(next.quantity);
    if (size) {
      setPackageAmount(String(size.amount));
      setPackageUnit(size.unit);
    }
    setFilledFrom(code);
  }

  const photo = imageUrl && !photoFailed ? imageUrl : null;
  const found = autofill.status === "found" ? autofill.suggestion : null;
  const filled = filledFrom !== null && filledFrom === barcode.trim();

  const codes = (
    <Stack gap="sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("fields.barcode")}
          htmlFor="product-barcode"
          optionalLabel={optional}
          description={t("fields.barcodeDescription")}
          errors={errors?.barcode}
        >
          <Input
            id="product-barcode"
            name="barcode"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            autoComplete="off"
            className="tabular-nums"
          />
        </FormField>
        <FormField
          label={t("fields.qrCode")}
          htmlFor="product-qr"
          optionalLabel={optional}
          description={t("fields.qrCodeDescription")}
          errors={errors?.qrCode}
        >
          <Input id="product-qr" name="qrCode" defaultValue={product?.qrCode ?? defaults?.qrCode ?? ""} autoComplete="off" />
        </FormField>
      </div>

      <div aria-live="polite">
        {autofill.status === "loading" ? (
          <p className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("autofill.lookingUp")}
          </p>
        ) : found && autofill.status === "found" ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <ProductSuggestionCard suggestion={found} size="md" />
            <Button type="button" className="h-11 sm:h-10" onClick={() => applySuggestion(found, autofill.code)}>
              <SparklesIcon />
              {t("autofill.apply")}
            </Button>
          </div>
        ) : autofill.status === "not_found" ? (
          <p className="text-sm text-muted-foreground">{t("autofill.notFound")}</p>
        ) : autofill.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">{t("autofill.unavailable")}</p>
        ) : filled && !product ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SparklesIcon className="size-4 shrink-0" aria-hidden="true" />
            {t("autofill.filled")}
          </p>
        ) : null}
      </div>
    </Stack>
  );

  return (
    <fetcher.Form method="post" noValidate aria-busy={busy || undefined}>
      <input type="hidden" name="intent" value={product ? "update-product" : "create-product"} />
      {product && <input type="hidden" name="id" value={product.id} />}
      <fieldset disabled={busy} className="contents">
        <Stack gap="lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoFailed(true)}
                  className="size-14 shrink-0 rounded-lg border bg-white object-contain p-0.5"
                />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-section-soft text-section">
                  <ProductCategoryIcon category={category} className="size-5" />
                </span>
              )}
              <Stack gap="xs">
                <DialogTitle>{product ? t("products.editTitle") : t("products.createTitle")}</DialogTitle>
                <DialogDescription>{t("products.formDescription")}</DialogDescription>
              </Stack>
            </div>
          </DialogHeader>
          {result?.formError && <InlineAlert tone="error">{result.formError}</InlineAlert>}

          {/* A new product starts from its barcode: typing one fills in the rest when it is known. */}
          {!product && codes}

          <FormField label={t("fields.name")} htmlFor="product-name" errors={errors?.name}>
            <Input id="product-name" name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" required />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <FormField label={t("fields.category")} htmlFor="product-category" errors={errors?.category}>
              <Select name="category" value={category} onValueChange={(value) => setCategory(value as ProductCategory)}>
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      <ProductCategoryIcon category={option} />
                      {t(`categories.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("fields.unit")} htmlFor="product-unit" optionalLabel={optional} errors={errors?.unit}>
              <Input
                id="product-unit"
                name="unit"
                defaultValue={product?.unit ?? defaults?.unit ?? ""}
                placeholder={t("fields.unitPlaceholder")}
                autoComplete="off"
              />
            </FormField>
          </div>

          <input type="hidden" name="isEssential" value={String(isEssential)} />
          <FormField label={t("fields.isEssential")} htmlFor="product-essential" description={t("fields.isEssentialDescription")}>
            <input
              id="product-essential"
              type="checkbox"
              checked={isEssential}
              onChange={(event) => setIsEssential(event.target.checked)}
              className="size-5 accent-primary"
            />
          </FormField>

          {/* Amount and unit belong together: one row, also on a phone. */}
          <FormField
            label={t("fields.packageSize")}
            htmlFor="product-package-amount"
            optionalLabel={optional}
            description={t("fields.packageSizeDescription")}
            errors={errors?.packageAmount?.map((message) => (message === "packageBoth" ? t("errors.packageBoth") : message))}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <Input
                id="product-package-amount"
                name="packageAmount"
                inputMode="decimal"
                value={packageAmount}
                onChange={(event) => setPackageAmount(event.target.value)}
                placeholder="200"
                autoComplete="off"
                className="text-base sm:text-sm"
              />
              <input type="hidden" name="packageUnit" value={packageUnit} />
              <Select value={packageUnit || undefined} onValueChange={setPackageUnit}>
                <SelectTrigger aria-label={t("fields.packageUnit")} className="w-full">
                  <SelectValue placeholder={t("fields.packageUnitPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {t(`packageUnits.${unit}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormField>

          <FormField label={t("fields.defaultShop")} htmlFor="product-shop" optionalLabel={optional} errors={errors?.defaultShopId}>
            <ShopPicker
              id="product-shop"
              name="defaultShopId"
              shops={shops}
              value={defaultShopId}
              onChange={setDefaultShopId}
              clearable
              initialSelections={initialSelections}
            />
          </FormField>

          <ProductLinkField
            product={product}
            shops={shops}
            defaultShopId={defaultShopId}
            onDefaultShop={setDefaultShopFromLink}
            empty={{ name: !name.trim(), imageUrl: !imageUrl.trim() }}
            onFill={(fill) => {
              if (fill.name) setName(fill.name);
              if (fill.imageUrl) {
                setImageUrl(fill.imageUrl);
                setPhotoFailed(false);
              }
            }}
            previewLink={previewLink}
            errors={errors?.linkUrl}
          />

          {product && codes}

          {isStoredPhoto(imageUrl) ? (
            <FormField label={t("fields.photo")} htmlFor="product-photo-remove" errors={errors?.imageUrl}>
              <div className="flex items-center gap-3">
                <input type="hidden" name="imageUrl" value={imageUrl} />
                {photo ? (
                  <img src={photo} alt="" onError={() => setPhotoFailed(true)} className="size-16 rounded-lg border bg-white object-contain p-0.5" />
                ) : (
                  <span className="grid size-16 place-items-center rounded-lg border text-muted-foreground">
                    <ImageOffIcon className="size-6" aria-hidden="true" />
                  </span>
                )}
                <Button id="product-photo-remove" type="button" variant="outline" onClick={() => setImageUrl("")}>
                  {t("fields.removePhoto")}
                </Button>
              </div>
            </FormField>
          ) : (
            <FormField label={t("fields.imageUrl")} htmlFor="product-image" optionalLabel={optional} errors={errors?.imageUrl}>
              <Input
                id="product-image"
                name="imageUrl"
                type="url"
                inputMode="url"
                value={imageUrl}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  setPhotoFailed(false);
                }}
                autoComplete="off"
              />
            </FormField>
          )}

          <FormField label={t("fields.notes")} htmlFor="product-notes" optionalLabel={optional} errors={errors?.notes}>
            <Textarea id="product-notes" name="notes" rows={2} defaultValue={product?.notes ?? ""} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {tCommon("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {busy ? tCommon("form.saving") : tCommon("actions.save")}
            </Button>
          </DialogFooter>
        </Stack>
      </fieldset>
    </fetcher.Form>
  );
}
