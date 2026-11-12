import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { CookingPotIcon, HistoryIcon, PackageMinusIcon, PackagePlusIcon, PencilIcon, ShoppingCartIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink } from "@/components/shared/record-link";
import { formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/types/date-format";
import type { StockMovement, StockMovementReason } from "../types/inventory";

const ICONS: Record<StockMovementReason, LucideIcon> = {
  scan_use: PackageMinusIcon,
  scan_add: PackagePlusIcon,
  bought: ShoppingCartIcon,
  manual_correction: PencilIcon,
  cooked: CookingPotIcon,
};

/** The history of a product's stock: who changed what, when and why. Newest first. */
export function StockMovementList({ movements, showPlace = true }: { movements: StockMovement[]; showPlace?: boolean }) {
  const { t } = useTranslation("inventory");
  const locale = currentLocale();

  if (movements.length === 0) {
    return (
      <Text size="sm" tone="muted" className="flex items-center gap-2">
        <HistoryIcon className="size-4" aria-hidden="true" />
        {t("history.empty")}
      </Text>
    );
  }

  return (
    <ol className="flex flex-col">
      {movements.map((movement) => {
        const Icon = ICONS[movement.reason];
        const positive = movement.delta > 0;
        return (
          <li key={movement.id} className="flex items-start gap-3 border-b py-2.5 last:border-b-0">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <Stack gap="none" className="min-w-0 flex-1">
              <span className="text-sm font-medium">{t(`reasons.${movement.reason}`)}</span>
              <span className="text-xs text-muted-foreground">
                {[
                  formatDateTime(movement.createdAt, locale),
                  movement.userName,
                  showPlace ? movement.placeName : null,
                  movement.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {(movement.purchase || movement.needId || movement.cookingEntryId) && <Inline gap="none" align="stretch" wrap className="gap-x-3 text-xs">
                {movement.purchase && <RecordLink to={`/purchases/${movement.purchase.kind === "acquisition" ? "acquisitions/" : ""}${encodeURIComponent(movement.purchase.id)}`} className="inline-flex min-h-10 items-center text-primary hover:underline">{t("history.openPurchase")}</RecordLink>}
                {movement.needId && <RecordLink to={`/shopping/items/${encodeURIComponent(movement.needId)}`} className="inline-flex min-h-10 items-center text-primary hover:underline">{t("history.openNeed")}</RecordLink>}
                {movement.cookingEntryId && <RecordLink to={`/recipes/cook/${encodeURIComponent(movement.cookingEntryId)}`} className="inline-flex min-h-10 items-center text-primary hover:underline">{t("history.openCooking")}</RecordLink>}
              </Inline>}
            </Stack>
            <span className="flex flex-col items-end">
              <span className={cn("font-semibold tabular-nums", positive ? "text-success" : "text-foreground")}>
                {/* A merge of alternatives that only moved stock to its main product changes nothing: ±0. */}
                {positive ? "+" : movement.delta < 0 ? "−" : "±"}
                {formatQuantity(Math.abs(movement.delta), locale)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("history.after", { quantity: formatQuantity(movement.quantityAfter, locale) })}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
