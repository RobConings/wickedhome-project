import { useEffect } from "react";
import { SessionItemAdjustDialog } from "@/features/shopping/components/session-item-adjust-dialog";
import type { Product } from "@/features/shopping/types/shopping";
import { tr } from "./design-i18n";

export function VisitAdjust({ row, onClose, onAdjusted }: {
  row: { label: string; meta: string; selectedVariant?: boolean }; onClose: () => void;
  onAdjusted: (quantity: number, name: string) => void;
}) {
  const product: Product = { id: row.label, name: tr(row.label), category: "other", unit: null, isEssential: false, defaultShopId: null, barcode: null, qrCode: null, imageUrl: null, notes: null, packageAmount: null, packageUnit: null, shopLinks: [], stockProductId: null, alternatives: [] };
  const alternative = { ...product, id: `${row.label}:variant`, name: `${product.name} · ${tr("Linked variant")}`, stockProductId: product.id };
  useEffect(() => {
    const receive = (event: Event) => {
      const result = (event as CustomEvent<{ itemId: string; quantity: number; productId: string }>).detail;
      if (result.itemId === row.label) onAdjusted(result.quantity, result.productId === alternative.id ? alternative.name : product.name);
    };
    window.addEventListener("wickedhome-design-adjusted", receive);
    return () => window.removeEventListener("wickedhome-design-adjusted", receive);
  }, [row.label, alternative.id, alternative.name, product.name, onAdjusted]);
  return <SessionItemAdjustDialog open onOpenChange={(open) => { if (!open) onClose(); }}
    initialSelections={{ favoriteIds: [], recentIds: [] }} products={[product, alternative]}
    item={{ id: row.label, productId: row.selectedVariant ? alternative.id : product.id, name: row.selectedVariant ? alternative.name : product.name, category: "other", quantity: Number(row.meta.match(/\d+(?:\.\d+)?/)?.[0] ?? 1), purchasedQuantity: 0, unit: null, status: "open", revision: 0, stockItemId: null, requirementIds: [], stockNeed: null, stockStatus: null, isEssential: false }}
  />;
}
