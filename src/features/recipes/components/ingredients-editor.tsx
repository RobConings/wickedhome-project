import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, PackagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProductFormDialog, ProductPicker, type Product } from "@/features/shopping";
import type { Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import { MAX_RECIPE_INGREDIENTS } from "../types/recipes";
import { draftsToInput, emptyIngredient, type IngredientDraft } from "./ingredient-drafts";

type IngredientsEditorProps = {
  id?: string;
  /** Posted as JSON under this name. */
  name: string;
  value: IngredientDraft[];
  onChange: (value: IngredientDraft[]) => void;
  products: Product[];
  /** For "+ New product". Without shops, the button is left out. */
  shops?: Shop[];
  /** Errors per posted name ("ingredients.2.name"). */
  errorsFor?: (name: string) => string[] | undefined;
  disabled?: boolean;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * The recipe's ingredients, one card per row: a product from the catalogue (favourites and recents first) or
 * just a name, the amount in the product's stock unit (1 pack), the recipe's own amount as a note ("200 g,
 * diced"), and "optional". Rows move up and down with buttons; "+ New product" adds a product to the
 * catalogue and links it to the row.
 */
export function IngredientsEditor({ id, name, value, onChange, products, shops, errorsFor, disabled, initialSelections }: IngredientsEditorProps) {
  const { t } = useTranslation("recipes");
  const [newProductFor, setNewProductFor] = React.useState<string | null>(null);
  const rows = value.length ? value : [];

  // A product made with "+ New product" arrives with the page's next reload: its name and unit fill in then.
  const missing = rows.filter((row) => row.productId && !row.name && products.some((product) => product.id === row.productId));
  React.useEffect(() => {
    if (!missing.length) return;
    onChange(
      rows.map((row) => {
        const product = row.productId && !row.name ? products.find((candidate) => candidate.id === row.productId) : undefined;
        return product ? { ...row, name: product.name, unit: row.unit || product.unit || "" } : row;
      }),
    );
    // Only when a product shows up for an unnamed row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.length, products]);

  const update = (key: string, patch: Partial<IngredientDraft>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row!);
    onChange(next);
  };
  const choose = (key: string, productId: string | null) => {
    const row = rows.find((candidate) => candidate.key === key);
    const product = products.find((candidate) => candidate.id === productId);
    const previous = products.find((candidate) => candidate.id === row?.productId);
    // The product's name and unit fill in, unless something else was typed.
    update(key, {
      productId,
      ...(product && (!row?.name || row.name === previous?.name) && { name: product.name }),
      ...(product?.unit && (!row?.unit || row.unit === previous?.unit) && { unit: product.unit }),
    });
  };

  return (
    <div id={id} className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(draftsToInput(rows, products))} />
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("ingredients.none")}</p>}
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const error = (field: string) => errorsFor?.(`${name}.${index}.${field}`);
          const nameErrors = error("name");
          const rowId = `${id ?? name}-${row.key}`;
          return (
            <li key={row.key} className={cn("flex flex-col gap-3 rounded-lg border bg-card p-3", nameErrors && "border-destructive")}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${rowId}-product`}>{t("ingredients.product", { number: index + 1 })}</Label>
                <ProductPicker
                  id={`${rowId}-product`}
                  products={products}
                  value={row.productId}
                  onChange={(productId) => choose(row.key, productId)}
                  placeholder={t("ingredients.productPlaceholder")}
                  disabled={disabled}
                  clearable
                  initialSelections={initialSelections}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${rowId}-name`}>{t("ingredients.name")}</Label>
                <Input
                  id={`${rowId}-name`}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  placeholder={t("ingredients.namePlaceholder")}
                  maxLength={120}
                  disabled={disabled}
                  aria-invalid={nameErrors ? true : undefined}
                  className="text-base sm:text-sm"
                />
                {nameErrors && <p className="text-sm text-destructive">{t("ingredients.nameRequired")}</p>}
              </div>
              {/* Amount and unit belong together: one row, also on a phone. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`${rowId}-quantity`}>{t("ingredients.quantity")}</Label>
                  <Input
                    id={`${rowId}-quantity`}
                    value={row.quantity}
                    onChange={(event) => update(row.key, { quantity: event.target.value })}
                    inputMode="decimal"
                    placeholder="1"
                    disabled={disabled}
                    aria-invalid={error("quantity") ? true : undefined}
                    className="text-base sm:text-sm"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`${rowId}-unit`}>{t("ingredients.unit")}</Label>
                  <Input
                    id={`${rowId}-unit`}
                    value={row.unit}
                    onChange={(event) => update(row.key, { unit: event.target.value })}
                    placeholder={t("ingredients.unitPlaceholder")}
                    maxLength={20}
                    disabled={disabled}
                    className="text-base sm:text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${rowId}-note`}>{t("ingredients.note")}</Label>
                <Input
                  id={`${rowId}-note`}
                  value={row.note}
                  onChange={(event) => update(row.key, { note: event.target.value })}
                  placeholder={t("ingredients.notePlaceholder")}
                  maxLength={200}
                  disabled={disabled}
                  className="text-base sm:text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <Switch checked={row.optional} onCheckedChange={(optional) => update(row.key, { optional })} disabled={disabled} />
                  {t("ingredients.optional")}
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                    aria-label={t("ingredients.moveUp", {
                      name: row.name || index + 1,
                    })}
                    title={t("ingredients.moveUp", {
                      name: row.name || index + 1,
                    })}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === rows.length - 1}
                    aria-label={t("ingredients.moveDown", {
                      name: row.name || index + 1,
                    })}
                    title={t("ingredients.moveDown", {
                      name: row.name || index + 1,
                    })}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onChange(rows.filter((candidate) => candidate.key !== row.key))}
                    disabled={disabled}
                    aria-label={t("ingredients.remove", {
                      name: row.name || index + 1,
                    })}
                    title={t("ingredients.remove", {
                      name: row.name || index + 1,
                    })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          fullOnMobile
          onClick={() => onChange([...rows, emptyIngredient()])}
          disabled={disabled || rows.length >= MAX_RECIPE_INGREDIENTS}
        >
          <PlusIcon />
          {t("ingredients.add")}
        </Button>
        {shops && (
          <Button
            type="button"
            variant="ghost"
            fullOnMobile
            disabled={disabled || rows.length >= MAX_RECIPE_INGREDIENTS}
            onClick={() => {
              const row = emptyIngredient();
              onChange([...rows, row]);
              setNewProductFor(row.key);
            }}
          >
            <PackagePlusIcon />
            {t("ingredients.newProduct")}
          </Button>
        )}
      </div>
      {/* Its form lives in a portal, but React still bubbles its submit to the recipe form: stop it here. */}
      {shops && (
        <div className="contents" onSubmit={(event) => event.stopPropagation()}>
          <ProductFormDialog
            shops={shops}
            open={newProductFor !== null}
            onOpenChange={(open) => !open && setNewProductFor(null)}
            onSaved={(productId) => {
              if (newProductFor) update(newProductFor, { productId });
              setNewProductFor(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
