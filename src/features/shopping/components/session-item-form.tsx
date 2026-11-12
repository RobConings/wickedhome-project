import * as React from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, PackageIcon } from "lucide-react";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RecordImage } from "@/components/shared/record-image";
import { SessionItemAdjustDialog } from "./session-item-adjust-dialog";
import type { ShoppingPageData } from "../data/shopping-loaders";
import type { SessionItem, SessionView } from "../types/sessions";
import type { updateSessionItem } from "../data/sessions-requests";
const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

export function SessionItemForm({
  item,
  session,
  shopping,
  disabled,
  onChange,
}: {
  item: SessionItem;
  session: SessionView;
  shopping: ShoppingPageData;
  disabled: boolean;
  onChange: (
    input: Omit<
      Parameters<typeof updateSessionItem>[2],
      "revision" | "operationId"
    >,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("shopping");
  const [adjusting, setAdjusting] = React.useState<SessionItem | null>(null);
  const product = shopping.products.find(
    (product) => product.id === item.productId,
  );
  const stocks = session.stockOptions.filter(
    (stock) => stock.productId === (product?.stockProductId ?? item.productId),
  );
  // A linked packaging variant may not have its own photo; retain its canonical product image.
  const imageUrl = product?.imageUrl ?? shopping.products.find((candidate) =>
    (candidate.stockProductId ?? candidate.id) === (product?.stockProductId ?? item.productId) && candidate.imageUrl,
  )?.imageUrl;
  const values = (form: HTMLFormElement) => ({
    quantity: item.quantity,
    stockItemId: field(form, "stockItemId") || undefined,
  });
  return (
    <>
    <form
      className="min-w-0 border-b border-border/70 px-3 py-2.5 last:border-b-0"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        void onChange({
          ...values(form),
          status: "bought",
          purchasedQuantity: Number(field(form, "purchasedQuantity")),
        });
      }}
   >
      <Inline gap="2.5" align="center" wrap className="min-w-0">
        <RecordImage src={imageUrl} alt="" shape="avatar" fit="contain"
          fallback={<PackageIcon className="size-5 text-section" aria-hidden="true" />}
          className="size-11 shrink-0 rounded-lg" />
        <Stack gap="none" className="min-w-32 flex-1">
          <Text size="sm" weight="semibold" className="break-words leading-snug">{item.name}</Text>
          <Text size="xs" tone="muted" className="mt-0.5">
            {item.purchasedQuantity}/{item.quantity} {item.unit} · {t(
              "sessions.item_" + item.status,
            )}
          </Text>
        </Stack>
        <Inline gap="1.5" align="center" wrap className="sm:ml-auto">
          {item.status !== "bought" && (
            <Button disabled={disabled} size="sm" className="min-h-10 sm:min-h-9" type="submit">
              <CheckIcon />{t("sessions.buy")}
            </Button>
          )}
          {item.status !== "bought" && (
            <Button disabled={disabled} size="sm" variant="outline" className="min-h-10 sm:min-h-9"
              type="button" onClick={() => void onChange({ status: item.status === "skipped" ? "open" : "skipped" })}>
              {t(item.status === "skipped" ? "planning.restore" : "planning.skip")}
            </Button>
          )}
          {item.status === "bought" && <Badge variant="success"><CheckIcon />{t("sessions.item_bought")}</Badge>}
          <Button disabled={disabled} size="sm" variant="ghost" className="min-h-10 sm:min-h-9"
            type="button" onClick={() => setAdjusting(item)}>{t("sessions.adjust")}</Button>
        </Inline>
      </Inline>
      <details className="mt-2 rounded-lg bg-muted/30 px-2">
        <summary className="min-h-9 cursor-pointer py-2 text-xs text-muted-foreground">
          {t("sessions.purchaseDetails")}
        </summary>
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            {t("sessions.boughtQuantity")}
            <Input
              key={`quantity:${item.revision}`}
              name="purchasedQuantity"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue={Math.max(item.quantity, item.purchasedQuantity)}
            />
          </label>
          {stocks.length > 0 && (
            <label className="text-sm">
              {t("sessions.stockLocation")}
              <select
                key={`stock:${item.revision}`}
                name="stockItemId"
                className={selectClass}
                defaultValue={
                  item.stockItemId ?? (stocks.length === 1 ? stocks[0]!.id : "")
                }
             >
                <option value="">{t("sessions.chooseLocation")}</option>
                {stocks.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.placeName} · {stock.unit}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <Inline gap="sm" align="stretch" wrap>
          <Button
            disabled={disabled}
            variant="outline"
            type="button"
            onClick={(event) =>
              void onChange({ stockItemId: values(event.currentTarget.form!).stockItemId })
            }
         >
            {t("sessions.saveLocation")}
          </Button>
          <Button
            disabled={disabled}
            variant="ghost"
            type="button"
            onClick={() => void onChange({ remove: true })}
         >
            {t("sessions.remove")}
          </Button>{" "}
        </Inline>
      </details>
    </form>
      {adjusting && <SessionItemAdjustDialog item={adjusting} products={shopping.products} open onOpenChange={(open) => { if (!open) setAdjusting(null); }} />}
    </>
  );
}
