import { useTranslation } from "react-i18next";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useLiveRevalidation } from "../data/use-live-shopping";
import { fetchShoppingSession } from "../data/sessions-requests";
import type { SessionView, ShoppingFinanceOptions } from "../types/sessions";
import { SessionPayments } from "./session-payments";

/** The existing payment owner contributes its controls to a purchase page. */
export function PurchasePaymentsPanel({ sessionId, purchaseId, initial, initialOptions }: { sessionId: string; purchaseId: string; initial?: SessionView; initialOptions?: ShoppingFinanceOptions }) {
  const { t } = useTranslation("shopping");
  const resource = useAsyncResource(`purchase-payments:${sessionId}`, () => fetchShoppingSession(sessionId), { initial });
  useLiveRevalidation(initial ? null : 30_000);
  const session = resource.data;
  const purchase = session?.purchases.find((row) => row.id === purchaseId);
  if (resource.error) return <InlineAlert tone="error">{t("errors.generic")}</InlineAlert>;
  if (!session || !purchase) return null;
  return <SessionPayments session={session} purchase={purchase} payeeDefault={session.name} disabled={false} initialOptions={initialOptions} />;
}
