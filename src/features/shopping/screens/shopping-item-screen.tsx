import { useCallback, useMemo, useState, type ReactNode } from "react";
import { PackageIcon, PencilIcon, ReceiptTextIcon, ShoppingBasketIcon, StoreIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useRevalidator } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { IconChip } from "@/components/shared/icon-chip";
import { RecordImage } from "@/components/shared/record-image";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/features/shops";
import { currentLocale } from "@/lib/i18n";
import { ShoppingItemFormDialog } from "../components/shopping-item-form-dialog";
import { ShoppingItemRow } from "../components/shopping-item-row";
import { ShoppingSourceBadge } from "../components/shopping-source-badge";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import { shoppingItemQuantity } from "../types/shopping-product-rows";
import type { Product, ShoppingItem } from "../types/shopping";

export function ShoppingItemScreen({ item, products, shops, canManage, attachments }: {
  item: ShoppingItem; products: Product[]; shops: Shop[]; canManage: boolean; attachments?: ReactNode;
}) {
  const { t } = useTranslation("shopping");
  const { t: tc } = useTranslation();
  const [editing, setEditing] = useState(false);
  const revalidator = useRevalidator();
  const refresh = useCallback(() => void revalidator.revalidate(), [revalidator]);
  const items = useMemo(() => [item], [item]);
  const actions = useShoppingItemActions({ items, onChanged: refresh });
  const fetcher = useFetcher<ShoppingActionResult>();
  const current = actions.items[0] ?? item;
  const listHref = `/shopping?list=${encodeURIComponent(item.listId)}`;
  const product = products.find((row) => row.id === item.productId);
  return <PageContainer>
    <PageHeader title={item.name} icon={ShoppingBasketIcon} eyebrow={t("need.title")} backTo={listHref} actions={<>
      <Button asChild><RecordLink to={listHref}>{t("need.list")}</RecordLink></Button>
      {canManage && <><Button variant="outline" onClick={() => setEditing(true)}><PencilIcon />{tc("actions.edit")}</Button><ConfirmDialog trigger={<Button variant="outline"><Trash2Icon />{tc("actions.delete")}</Button>} title={t("need.removeTitle")} description={t("need.removeHint")} confirmLabel={tc("actions.delete")} cancelLabel={tc("actions.cancel")} destructive onConfirm={() => fetcher.submit({ intent: "delete-item", id: item.id }, { method: "post" })} /></>}
    </>} />
    {fetcher.data?.formError && <p role="alert" className="text-destructive">{fetcher.data.formError}</p>}
    <Card>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
        <RecordImage src={item.imageUrl ?? product?.imageUrl} alt="" fit="contain" className="h-36 w-full sm:h-32" fallback={<ShoppingBasketIcon className="size-12 text-section" aria-hidden="true" />} />
        <div className="min-w-0">
          <p className="mb-2 text-sm text-muted-foreground">{t("need.purchasesHint")}</p>
          <ul className="divide-y"><ShoppingItemRow item={current} onToggle={actions.toggle} showList showSource showRecordLink={false} /></ul>
        </div>
      </div>
    </Card>
    <PageGrid columns="main-sidebar">
      <Card><CardTitle>{t("need.reasons")}</CardTitle><ul className="divide-y">{(item.requirements ?? [item]).map((reason) => <li className="flex flex-col gap-3 py-4" key={reason.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><ShoppingSourceBadge source={reason.source} recipeName={reason.recipe?.name} /><span className="font-medium tabular-nums">{shoppingItemQuantity(reason, currentLocale())}</span></div>
        <RecordLink className="font-medium underline" to={`/shopping?list=${encodeURIComponent(reason.listId)}`}>{reason.listName}</RecordLink>
        {reason.taskId && <RecordLink className="min-h-11 py-2 underline" to={`/tasks/${encodeURIComponent(reason.taskId)}`}>{t("source.task")}</RecordLink>}
        {reason.recipe && <RecordLink className="min-h-11 py-2 underline" to={`/recipes/cook/${encodeURIComponent(reason.recipe.entryId)}`}>{reason.recipe.name}</RecordLink>}
        {reason.project && <RecordLink className="min-h-11 py-2 underline" to={`/projects/${encodeURIComponent(reason.project.id)}`}>{reason.project.name}</RecordLink>}
        {reason.placeId && <RecordLink className="min-h-11 py-2 underline" to={`/places/${encodeURIComponent(reason.placeId)}`}>{reason.placeName ?? t("need.notRecorded")}</RecordLink>}
        {reason.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{reason.note}</p>}
      </li>)}</ul></Card>
      <Card className="self-start">
        <div className="flex items-center gap-2"><IconChip icon={PackageIcon} tone="shopping" size="sm" /><CardTitle>{t("need.connected")}</CardTitle></div>
        <DescriptionList>
        {item.productId && <DescriptionItem wide label={t("need.product")}><RecordLink className="underline" to={`/inventory/products/${encodeURIComponent(item.productId)}`}>{product?.name ?? item.name}</RecordLink></DescriptionItem>}
        {item.shop && <DescriptionItem wide label={t("fields.shop")}><RecordLink className="underline" to={`/shops/${encodeURIComponent(item.shop.id)}`}>{item.shop.name}</RecordLink></DescriptionItem>}
        {item.expenseId && <DescriptionItem wide label={t("need.expense")}><RecordLink className="inline-flex min-h-11 items-center gap-2 underline" to={`/expenses/${encodeURIComponent(item.expenseId)}`}><ReceiptTextIcon className="size-4" aria-hidden="true" />{t("need.openExpense")}</RecordLink></DescriptionItem>}
      </DescriptionList>
      {item.alternatives.length > 0 && <div className="border-t pt-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><StoreIcon className="size-4 text-section" aria-hidden="true" />{t("need.alternatives")}</h3>
        <ul className="flex flex-col gap-1">
          {item.alternatives.map((alternative) => <li key={alternative.productId}>
            <RecordLink className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-accent" to={`/inventory/products/${encodeURIComponent(alternative.productId)}`}>{alternative.name}</RecordLink>
          </li>)}
        </ul>
      </div>}
      <div className="border-t pt-3">
        <RecordLink className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium underline-offset-4 hover:underline" to={`/purchases?requirementId=${encodeURIComponent(item.id)}`}>
          <ReceiptTextIcon className="size-4 text-section" aria-hidden="true" />{t("need.purchases")}
        </RecordLink>
      </div></Card>
    </PageGrid>
    {attachments}
    {canManage && <ShoppingItemFormDialog item={editing ? item : null} onOpenChange={setEditing} products={products} shops={shops} onSaved={refresh} />}
    {actions.confirmation}
  </PageContainer>;
}
