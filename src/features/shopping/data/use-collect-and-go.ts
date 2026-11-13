import * as React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { useLiveEvents } from "@/lib/live-events";
import type { CollectAndGoStatus } from "../types/collect-and-go";
import { useRefreshWhileVisible } from "./use-live-shopping";
import { collectAndGoClient } from "./collect-and-go-requests";
export type { CollectAndGoReadError } from "../types/collect-and-go-activity";
import { collectAndGoIssue, type CollectAndGoReadError, type CollectAndGoActivity } from "../types/collect-and-go-activity";
export type CollectAndGoInitial = CollectAndGoActivity & { status: CollectAndGoStatus };
export function collectAndGoReadError(error: unknown): CollectAndGoReadError {
  return collectAndGoIssue(error instanceof ApiRequestError ? error.code : "");
}
export function useCollectAndGo({ initial, intervalMs = 30000, client = collectAndGoClient }: { initial?: CollectAndGoInitial; intervalMs?: number | null; client?: typeof collectAndGoClient } = {}) {
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
      if (!status.connected || !status.canUse || status.needsReconnect) { setData({ status, ...(status.needsReconnect && { cartError: status.reconnectReason === "challenge" ? "blocked" : "reconnect", ordersError: status.reconnectReason === "challenge" ? "blocked" : "reconnect" }) }); return; }
      setData(previous => ({ ...previous, status }));
      const activity = await client.activity();
      if (!current()) return;
      setData(previous => ({ ...activity, status, cart: activity.cart ?? previous?.cart, orders: activity.orders ?? previous?.orders }));
    } catch (error) {
      if (current()) {
        if (error instanceof ApiRequestError && [401, 403].includes(error.status)) setData(null);
        else setData(previous => previous ? { ...previous, cartError: collectAndGoReadError(error), ordersError: collectAndGoReadError(error), reservations: [] } : { status: { connected: false, enabled: false, configured: true, canManage: false, canUse: false, needsReconnect: false, legacyAvailable: false, importedAt: null, members: [] }, cartError: collectAndGoReadError(error) });
      }
    } finally {
      state.busy = false;
      if (current()) setLoading(false);
      if (state.mounted && state.queued) { state.queued = false; void run(); }
    }
  }, [client]);
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
