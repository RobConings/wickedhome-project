import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/shared/inline-alert";
import { xtraClient } from "../data/xtra-requests";
import type { XtraProduct, XtraSearchResult, XtraStatus } from "../types/xtra";

export function XtraProductSearch({ onSelect, editingId, initial, client = xtraClient }: { onSelect: (product: XtraProduct) => void; editingId?: string; initial?: XtraStatus; client?: Pick<typeof xtraClient, "status" | "search"> }) {
  const { t, i18n } = useTranslation("shopping");
  const [status, setStatus] = React.useState(initial ?? null);
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState<XtraSearchResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const requestState = React.useRef({ sequence: 0, mounted: true });
  React.useEffect(() => {
    const state = requestState.current; state.mounted = true;
    if (!initial) void client.status().then((next) => { if (state.mounted) setStatus(next); }).catch(() => undefined);
    return () => { state.mounted = false; state.sequence++; };
  }, [initial, client]);
  async function search() {
    if (query.trim().length < 2 || busy) return;
    const request = ++requestState.current.sequence;
    setBusy(true); setFailed(false); setResult(null);
    try { const next = await client.search(query.trim()); if (requestState.current.mounted && request === requestState.current.sequence) setResult(next); }
    catch { if (requestState.current.mounted && request === requestState.current.sequence) setFailed(true); }
    finally { if (requestState.current.mounted && request === requestState.current.sequence) setBusy(false); }
  }
  if (!status?.canUse || !status.connected) return null;
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="min-w-0 rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">{t("xtra.searchTitle")}</summary>
    <Stack gap="3" className="mt-3 min-w-0">
      {status.needsReconnect ? <InlineAlert tone="error">{t("xtra.reconnect")}</InlineAlert> : <>
        <label htmlFor="xtra-product-query" className="text-sm">{t("xtra.searchLabel")}</label>
        <Inline gap="sm" align="stretch">
          <Input id="xtra-product-query" type="search" value={query} maxLength={120} placeholder={t("xtra.searchPlaceholder")} disabled={busy} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
          <Button type="button" disabled={busy || query.trim().length < 2} onClick={() => void search()}>{t(busy ? "xtra.searching" : "xtra.search")}</Button>
        </Inline>
        {failed && <InlineAlert tone="error">{t("xtra.searchError")}</InlineAlert>}
        {result && <>
          <Text size="xs" tone="muted">{t("xtra.prices", { id: result.placeId, date: new Date(result.observedAt).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) })}</Text>
          {!result.products.length && <Text size="sm" role="status">{t("xtra.noResults")}</Text>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {result.products.map((product) => {
              const duplicate = Boolean(product.existingProduct && product.existingProduct.id !== editingId);
              return <li key={product.offer} className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
                {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded bg-white object-contain" />}
                <Stack gap="xs" className="min-w-0 flex-1">
                  <Text size="sm" weight="medium" className="break-words">{product.name}</Text>
                  <Text size="xs" tone="muted" className="break-words">{[product.brand, product.content].filter(Boolean).join(" · ")}</Text>
                  <Text size="sm">{product.priceCents === null ? t("xtra.noPrice") : new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR" }).format(product.priceCents / 100)}</Text>
                  {duplicate ? <Text size="xs" tone="muted">{t("xtra.duplicate", { name: product.existingProduct!.name })}</Text> : <Button type="button" variant="outline" size="sm" className="mt-1 self-start" onClick={() => { onSelect(product); setOpen(false); }}>{t("xtra.useProduct")}</Button>}
                </Stack>
              </li>;
            })}
          </ul>
        </>}
      </>}
    </Stack>
  </details>;
}
