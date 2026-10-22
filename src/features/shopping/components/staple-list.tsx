import * as React from "react";
import { PencilIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import type { Shop } from "@/features/shops";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { formatDate } from "@/types/date-format";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { formatQuantity, type Product, type ShoppingList, type ShoppingStaple } from "../types/shopping";
import { StapleFormDialog } from "./staple-form-dialog";
import { describeStapleRepeat } from "./staple-repeat";

type StapleListProps = {
  staples: ShoppingStaple[];
  lists: ShoppingList[];
  products: Product[];
  shops: Shop[];
  canManage: boolean;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
};

/** Recurring staples with how often they come back and when next. Managers edit and stop them. */
export function StapleList({ staples, lists, products, shops, canManage, initialSelections }: StapleListProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<ShoppingActionResult>();
  const locale = currentLocale();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);
  const listName = (id: string) => lists.find((list) => list.id === id)?.name ?? "";
  const shopName = (id: string | null) => (id ? shops.find((shop) => shop.id === id)?.name : undefined);

  if (staples.length === 0) return <p className="text-sm text-muted-foreground">{t("staples.empty")}</p>;

  return (
    <ul className="divide-y">
      {staples.map((staple) => {
        const amount = staple.quantity !== 1 || staple.unit ? `${formatQuantity(staple.quantity, locale)} ${staple.unit ?? ""}`.trim() : null;
        return (
          <li key={staple.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-section-soft text-section">
              <RepeatIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">
                {staple.name}
                {amount && <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{amount}</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  describeStapleRepeat(staple.rrule, t),
                  t("staples.nextDue", { date: formatDate(staple.nextDueOn, locale, { weekday: "short" }) }),
                  shopName(staple.shopId),
                  listName(staple.listId),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {canManage && (
              <>
                <StapleFormDialog
                  staple={staple}
                  lists={lists}
                  products={products}
                  shops={shops}
                  initialSelections={initialSelections}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={t("staples.edit", { name: staple.name })} title={t("staples.edit", { name: staple.name })}>
                      <PencilIcon />
                    </Button>
                  }
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={t("staples.deleteTitle", { name: staple.name })}>
                      <Trash2Icon />
                    </Button>
                  }
                  title={t("staples.deleteTitle", { name: staple.name })}
                  description={t("staples.deleteDescription")}
                  confirmLabel={tCommon("actions.delete")}
                  cancelLabel={tCommon("actions.cancel")}
                  destructive
                  onConfirm={() => fetcher.submit({ intent: "delete-staple", id: staple.id }, { method: "post" })}
                />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
