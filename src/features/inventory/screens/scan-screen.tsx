import * as React from "react";
import { ArrowLeftIcon, CircleHelpIcon, Layers2Icon, PackageMinusIcon, PackagePlusIcon, PackageSearchIcon, PlusIcon, ScanLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Stack } from "../components/stack";
import { BarcodeScanner } from "../components/barcode-scanner";
import { Card, CardDescription, CardTitle } from "../components/card";
import { InlineAlert } from "../components/inline-alert";
import { LoadingState } from "../components/loading-state";
import { PageHeader } from "../components/page-header";
import { SegmentedControl } from "../components/segmented-control";
import {
  LinkAlternativeDialog,
  ProductCategoryIcon,
  ProductFormDialog,
  ProductSuggestionCard,
  formatQuantity,
  isLookupBarcode,
  lookupBarcode,
  type BarcodeLookupResult,
} from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { StockItemFormDialog } from "../components/stock-item-form-dialog";
import { StockItemRow } from "../components/stock-item-row";
import type { ScanPageData } from "../data/inventory-loaders";
import { scanCode as defaultScanCode } from "../data/inventory-requests";
import { useStockActions } from "../data/use-stock-actions";
import type { ScanMode, ScanResult, StockItem } from "../types/inventory";

type ScanScreenProps = {
  data: ScanPageData;
  canManage: boolean;
  initialMode?: ScanMode;
  /** Looks a code up in the household's own products; defaults to the API (stories pass a fake). */
  lookup?: (code: string) => Promise<ScanResult>;
  /** Finds out what an unknown barcode is (auto-fill); defaults to the API (stories pass a fake). */
  productLookup?: (code: string) => Promise<BarcodeLookupResult>;
  /** Show this result right away (stories). */
  initialResult?: ScanResult;
  /** With `initialResult` for an unknown code: what the barcode turned out to be (stories). */
  initialAutofill?: BarcodeLookupResult;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; places?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
};

/** EAN codes are digits; anything else is treated as one of our own QR labels. */
const isEan = (code: string) => /^\d{6,14}$/.test(code);

/** What is being looked up right now: the household's own products first, then what an unknown barcode is. */
type Phase = { step: "own" | "autofill"; code: string } | null;

/**
 * Scan with the phone camera: use one, add stock, or "what is this?". An unknown barcode is looked up and,
 * when known, offered as a pre-filled new product; after saving it, choose where it is kept or link it as
 * an alternative of a product you already have. A scanned alternative (another brand) acts on the stock
 * it shares with its main product.
 */
export function ScanScreen({
  data,
  canManage,
  initialMode = "use",
  lookup = defaultScanCode,
  productLookup = lookupBarcode,
  initialResult,
  initialAutofill,
  initialSelections,
}: ScanScreenProps) {
  const { t } = useTranslation("inventory");
  const { t: tShopping } = useTranslation("shopping");
  const locale = currentLocale();
  const revalidator = useRevalidator();
  const { products, places, shops } = data;
  const [mode, setMode] = React.useState<ScanMode>(initialMode);
  const [result, setResult] = React.useState<ScanResult | null>(initialResult ?? null);
  const [autofill, setAutofill] = React.useState<BarcodeLookupResult | null>(initialAutofill ?? null);
  const [phase, setPhase] = React.useState<Phase>(null);
  const busy = phase !== null;
  const [needsChoice, setNeedsChoice] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  /** The product whose "where do you keep it?" dialog is open. */
  const [keepFor, setKeepFor] = React.useState<string | null>(null);
  /** The product that was just added from this scan: next, keep it somewhere or link it as an alternative. */
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState(false);
  // The saved stock item replaces the one on screen in the same update that drops the optimistic change.
  const replaceStock = React.useCallback(
    ({ stockItem }: { stockItem: StockItem }) =>
      setResult((previous) =>
        previous ? { ...previous, stockItems: previous.stockItems.map((stock) => (stock.id === stockItem.id ? stockItem : stock)) } : previous,
      ),
    [],
  );
  const { adjust, isPending, show } = useStockActions({ onChanged: replaceStock });

  // `product` holds the stock (the main product for an alternative); `scanned` is the brand that was scanned.
  const product = result?.productId ? products.find((candidate) => candidate.id === result.productId) : undefined;
  const scanned = result?.scannedProductId ? products.find((candidate) => candidate.id === result.scannedProductId) : undefined;
  const sharesStock = Boolean(scanned && product && scanned.id !== product.id);
  const shown = scanned ?? product;
  const ungrouped = product && !product.stockProductId && product.alternatives.length === 0;
  const delta = mode === "use" ? -1 : 1;
  const suggestion = autofill?.status === "found" && result && !result.productId ? autofill.suggestion : null;

  const apply = React.useCallback(
    async (item: StockItem, change: number) => {
      // Optimistic: the amount changes and the choice closes at once; a failure is taken back with a toast.
      setNeedsChoice(false);
      const outcome = await adjust(item, change, change < 0 ? "scan_use" : "scan_add");
      if (!outcome) return;
      const left = `${formatQuantity(outcome.stockItem.quantity, locale)}${outcome.stockItem.unit ? ` ${outcome.stockItem.unit}` : ""}`;
      toast.success(
        t(change < 0 ? "scan.used" : "scan.added", { name: item.productName, place: item.placeName, quantity: left }),
      );
    },
    [adjust, locale, t],
  );

  const handleCode = React.useCallback(
    async (code: string) => {
      setPhase({ step: "own", code });
      setNeedsChoice(false);
      setJustAdded(null);
      try {
        const found = await lookup(code);
        if (!found.productId && isLookupBarcode(code)) {
          // Not one of ours: find out what it is. A failed lookup is just "not found", never an error.
          setPhase({ step: "autofill", code });
          const answer = await productLookup(code).catch((): BarcodeLookupResult => ({ code, status: "unavailable", suggestion: null }));
          setResult(found);
          setAutofill(answer);
          if (answer.status === "found" && answer.suggestion && canManage) setCreating(true);
          return;
        }
        setResult(found);
        setAutofill(null);
        if (!found.productId || mode === "identify") return;
        const [only, ...others] = found.stockItems;
        // Not awaited: the result shows straight away with the change applied optimistically.
        if (only && others.length === 0) void apply(only, mode === "use" ? -1 : 1);
        else if (only) setNeedsChoice(true);
      } catch {
        toast.error(t("errors.generic"));
      } finally {
        setPhase(null);
      }
    },
    [lookup, productLookup, canManage, mode, apply, t],
  );

  /** Reloads the result for a code without changing any stock (after adding a product or a place). */
  const refresh = React.useCallback(
    async (code: string) => {
      try {
        setResult(await lookup(code));
        setAutofill(null);
      } catch {
        toast.error(t("errors.generic"));
      }
    },
    [lookup, t],
  );

  const modeOptions = [
    { value: "use" as const, label: t("scan.modes.use"), icon: PackageMinusIcon },
    { value: "add" as const, label: t("scan.modes.add"), icon: PackagePlusIcon },
    { value: "identify" as const, label: t("scan.modes.identify"), icon: PackageSearchIcon },
  ];

  const paused = busy || creating || needsChoice || keepFor !== null || linking;

  const productForm = result && !result.productId && canManage && (
    <ProductFormDialog
      shops={shops}
      open={creating}
      onOpenChange={setCreating}
      defaults={isEan(result.code) ? { barcode: result.code } : { qrCode: result.code }}
      suggestion={suggestion}
      lookup={productLookup}
      initialSelections={initialSelections?.shops}
      onSaved={(productId) => {
        // Next: where is it kept, or is it another brand of something already kept?
        setJustAdded(productId);
        void revalidator.revalidate();
        void refresh(result.code);
      }}
    />
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/inventory" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={t("scan.title")}
        description={t("scan.description")}
      />

      <PageGrid columns="2" className="items-start">
        <Stack gap="md">
          <SegmentedControl options={modeOptions} value={mode} onChange={setMode} label={t("scan.modeLabel")} className="self-start" />
          <BarcodeScanner onDetect={(code) => void handleCode(code)} paused={paused} busy={busy} />
        </Stack>

        <Card aria-live="polite" aria-busy={busy || undefined}>
          {phase !== null ? (
            <LoadingState
              label={phase.step === "own" ? t("scan.lookingUp", { code: phase.code }) : t("scan.findingOut")}
              className="min-h-40 tabular-nums"
            />
          ) : !result ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              <ScanLineIcon className="size-8" aria-hidden="true" />
              <p className="max-w-xs text-sm">{t(`scan.hints.${mode}`)}</p>
            </div>
          ) : !result.productId && suggestion ? (
            <Stack gap="md">
              <p className="text-sm font-medium text-muted-foreground">{t("scan.newProduct")}</p>
              <ProductSuggestionCard suggestion={suggestion} size="lg" />
              <CardDescription className="tabular-nums">{result.code}</CardDescription>
              {canManage ? (
                <>
                  <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:self-start" onClick={() => setCreating(true)}>
                    <PlusIcon />
                    {t("scan.addSuggested")}
                  </Button>
                  {productForm}
                </>
              ) : (
                <InlineAlert>{t("scan.suggestedChild")}</InlineAlert>
              )}
            </Stack>
          ) : !result.productId ? (
            <Stack gap="md">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <CircleHelpIcon className="size-6" aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <CardTitle>{autofill ? t("scan.notFoundTitle") : t("scan.unknownTitle")}</CardTitle>
                  <CardDescription className="tabular-nums">{result.code}</CardDescription>
                </div>
              </div>
              {canManage ? (
                <>
                  <p className="text-sm text-muted-foreground">{autofill ? t("scan.notFoundDescription") : t("scan.unknownDescription")}</p>
                  <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:self-start" onClick={() => setCreating(true)}>
                    <PlusIcon />
                    {t("scan.createProduct")}
                  </Button>
                  {productForm}
                </>
              ) : (
                <InlineAlert>{t("scan.unknownChild")}</InlineAlert>
              )}
            </Stack>
          ) : (
            <Stack gap="md">
              <div className="flex items-center gap-3">
                {shown?.imageUrl ? (
                  <img src={shown.imageUrl} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-lg border bg-white object-contain p-0.5" />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section">
                    {shown ? <ProductCategoryIcon category={shown.category} className="size-6" /> : <PackageSearchIcon className="size-6" aria-hidden="true" />}
                  </span>
                )}
                <div className="flex min-w-0 flex-col">
                  <CardTitle className="break-words">{shown?.name ?? result.stockItems[0]?.productName ?? result.code}</CardTitle>
                  {sharesStock && product && (
                    <CardDescription className="flex items-center gap-1.5 break-words">
                      <Layers2Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("scan.sharesWith", { name: product.name })}
                    </CardDescription>
                  )}
                  <CardDescription className="tabular-nums">{result.code}</CardDescription>
                </div>
              </div>

              {justAdded && justAdded === product?.id && result.stockItems.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("scan.whatNext")}</p>
              )}

              {needsChoice && <p className="text-sm font-medium">{t(mode === "use" ? "scan.chooseUse" : "scan.chooseAdd")}</p>}

              {result.stockItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("scan.notKept")}</p>
              ) : (
                <ul className="divide-y rounded-lg border px-3">
                  {result.stockItems.map((item) => (
                    <StockItemRow
                      key={item.id}
                      item={show(item)}
                      showProduct={false}
                      pending={isPending(item.id)}
                      onAdjust={(target, change) => void apply(target, change)}
                      actions={
                        needsChoice && (
                          <Button size="sm" onClick={() => void apply(item, delta)}>
                            {t(mode === "use" ? "scan.useHere" : "scan.addHere")}
                          </Button>
                        )
                      }
                    />
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                {canManage && product && result.stockItems.length === 0 && (
                  <Button className="h-11" onClick={() => setKeepFor(product.id)}>
                    <PlusIcon />
                    {t("actions.keepAt")}
                  </Button>
                )}
                {canManage && product && ungrouped && result.stockItems.length === 0 && (
                  <Button variant="outline" className="h-11" onClick={() => setLinking(true)}>
                    <Layers2Icon />
                    {tShopping("alternatives.linkOf")}
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link to={`/inventory/products/${encodeURIComponent(result.productId)}`}>{t("scan.openProduct")}</Link>
                </Button>
                {canManage && product && result.stockItems.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setKeepFor(product.id)}>
                    <PlusIcon />
                    {t("actions.keepAt")}
                  </Button>
                )}
                {needsChoice && (
                  <Button variant="ghost" size="sm" onClick={() => setNeedsChoice(false)}>
                    {t("scan.next")}
                  </Button>
                )}
              </div>
              {canManage && product && (
                <StockItemFormDialog
                  products={[product]}
                  places={places.filter((place) => !result.stockItems.some((item) => item.placeId === place.id))}
                  defaults={{ productId: product.id }}
                  initialSelections={initialSelections}
                  open={keepFor === product.id}
                  onOpenChange={(open) => setKeepFor(open ? product.id : null)}
                  onSaved={() => void refresh(result.code)}
                />
              )}
              {canManage && product && ungrouped && (
                <LinkAlternativeDialog
                  product={product}
                  products={products}
                  mode="of"
                  open={linking}
                  onOpenChange={setLinking}
                  initialSelections={initialSelections?.products}
                  onLinked={() => {
                    setJustAdded(null);
                    void revalidator.revalidate();
                    void refresh(result.code);
                  }}
                />
              )}
            </Stack>
          )}
        </Card>
      </PageGrid>
    </PageContainer>
  );
}
