import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { Product } from "../types/shopping";
import { ProductFormDialog } from "./product-form-dialog";

type ProductActionsProps = {
  product: Product;
  shops: Shop[];
  /** Deletes the product; return the promise so the confirm dialog stays busy until it is done. */
  onDelete: () => Promise<unknown>;
  initialSelections?: UseSelectionsOptions["initial"];
  /** The catalogue: the edit dialog then shows and links alternatives. */
  products?: Product[];
};

/** Edit and delete for one catalogue product, used by its row and its tile. */
export function ProductActions({ product, shops, onDelete, initialSelections, products }: ProductActionsProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  return (
    <span className="flex shrink-0 items-center">
      <ProductFormDialog
        product={product}
        shops={shops}
        products={products}
        initialSelections={initialSelections}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={tCommon("actions.edit")} title={tCommon("actions.edit")}>
            <PencilIcon />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={tCommon("actions.delete")}
            title={tCommon("actions.delete")}
          >
            <Trash2Icon />
          </Button>
        }
        title={t("products.deleteTitle", { name: product.name })}
        description={t("products.deleteDescription")}
        confirmLabel={tCommon("actions.delete")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={onDelete}
      />
    </span>
  );
}
