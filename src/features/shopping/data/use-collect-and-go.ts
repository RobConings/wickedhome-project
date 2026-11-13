import * as React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { useLiveEvents } from "@/lib/live-events";
import type { CollectAndGoCart, CollectAndGoOrders, CollectAndGoStatus } from "../types/collect-and-go";
import { useRefreshWhileVisible } from "./use-live-shopping";
import { collectAndGoClient } from "./collect-and-go-requests";
export type CollectAndGoReadError = "unavailable" | "reconnect" | "unverified" | "credentials";
export type CollectAndGoInitial = { status: CollectAndGoStatus; cart?: CollectAndGoCart; orders?: CollectAndGoOrders; cartError?: CollectAndGoReadError; ordersError?: CollectAndGoReadError };
export function collectAndGoReadError(error: unknown): CollectAndGoReadError {
  return error instanceof ApiRequestError ? error.code === "collectandgo_credentials_missing" ? "credentials" : ["collectandgo_login", "collectandgo_challenge"].includes(error.code) ? "reconnect" : error.code === "collectandgo_unverified" ? "unverified" : "unavailable" : "unavailable";
}
export function useCollectAndGo({ initial, intervalMs = 30000, includeOrders = false, client = collectAndGoClient }: { initial?: CollectAndGoInitial; intervalMs?: number | null; includeOrders?: boolean; client?: typeof collectAndGoClient } = {}) {
  const [data, setData] = React.useState<CollectAndGoInitial | null>(initial ?? null);
  const [loading, setLoading] = React.useState(false);
  const life = React.useRef({ mounted: false, epoch: 0, busy: false, queued: false });
  const refresh = React.useCallback(async function run() {
    const state = life.current;
    if (!state.mounted) return;
    if (state.busy) { state.queued = true; return; }
    state.busy = true; setLoading(true);
    const epoch = state.epoch, current = () => state.mounted && state.epoch === epoch;
    try {
      const status = await client.status();
      if (!current()) return;
      if (!status.connected || !status.canUse || status.needsReconnect) { setData({ status, ...(status.needsReconnect && { cartError: "reconnect", ordersError: "reconnect" }) }); return; }
      setData(previous => ({ ...previous, status }));
      const [cart, orders] = await Promise.allSettled([client.cart(), includeOrders ? client.orders() : Promise.resolve(undefined)]);
      if (!current()) return;
      const denied = [cart, orders].some(result => result.status === "rejected" && result.reason instanceof ApiRequestError && [401, 403].includes(result.reason.status));
      if (denied) { setData(null); return; }
      setData(previous => ({ status, cart: cart.status === "fulfilled" ? cart.value : previous?.cart, cartError: cart.status === "rejected" ? collectAndGoReadError(cart.reason) : undefined, orders: orders.status === "fulfilled" && orders.value ? orders.value : previous?.orders, ordersError: orders.status === "rejected" ? collectAndGoReadError(orders.reason) : includeOrders ? undefined : previous?.ordersError }));
    } catch (error) {
      if (current()) {
        if (error instanceof ApiRequestError && [401, 403].includes(error.status)) setData(null);
        else setData(previous => previous ? { ...previous, cartError: collectAndGoReadError(error), ordersError: collectAndGoReadError(error) } : { status: { connected: false, enabled: false, configured: true, canManage: false, canUse: false, needsReconnect: false, legacyAvailable: false, importedAt: null, members: [] }, cartError: collectAndGoReadError(error) });
      }
    } finally {
      state.busy = false;
      if (current()) setLoading(false);
      if (state.mounted && state.queued) { state.queued = false; void run(); }
    }
  }, [client, includeOrders]);
  React.useEffect(() => {
    const state = { mounted: true, epoch: 0, busy: false, queued: false }; life.current = state;
    if (!initial) void refresh();
    return () => { state.mounted = false; state.epoch++; };
  }, [initial, refresh]);
  useRefreshWhileVisible(() => void refresh(), intervalMs, !initial);
  useLiveEvents("ready", () => void refresh(), { enabled: !initial });
  useLiveEvents("shopping.collectandgo_changed", () => { life.current.epoch++; setData(null); if (document.visibilityState === "visible") void refresh(); }, { enabled: !initial });
  return { data, loading, refresh };
}
export type CollectAndGoLive = ReturnType<typeof useCollectAndGo>;
