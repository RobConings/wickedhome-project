import * as React from "react";
import { useRevalidator } from "react-router";
import { fetchShops, type Shop } from "@/features/shops";
import type { Product, ShoppingItem, ShoppingItemQuery } from "../types/shopping";
import { fetchProducts, fetchShoppingItems } from "./shopping-requests";

/** How often lists refresh while someone is shopping (no websockets: polling plus refresh on focus). */
export const LIVE_REFRESH_MS = 10_000;

/**
 * Calls `refresh` when the tab regains focus or becomes visible, and every `intervalMs` while it is
 * visible. Pass `intervalMs: null` to refresh on focus only.
 */
export function useRefreshWhileVisible(refresh: () => void, intervalMs: number | null = LIVE_REFRESH_MS, enabled = true) {
  const latest = React.useRef(refresh);
  React.useEffect(() => {
    latest.current = refresh;
  });

  React.useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    const timer = intervalMs ? window.setInterval(run, intervalMs) : undefined;
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      if (timer) window.clearInterval(timer);
    };
  }, [intervalMs, enabled]);
}

/** Revalidates the current route's loaders on focus and every `intervalMs` (live-ish sync between phones). */
export function useLiveRevalidation(intervalMs: number | null = LIVE_REFRESH_MS) {
  const revalidator = useRevalidator();
  const stateRef = React.useRef(revalidator.state);
  React.useEffect(() => {
    stateRef.current = revalidator.state;
  });
  useRefreshWhileVisible(() => {
    if (stateRef.current === "idle") void revalidator.revalidate();
  }, intervalMs);
}

/**
 * Shopping items for a component that lives on another feature's page (task, place, store visit): loads
 * them itself, refreshes on focus (and every `intervalMs` when given) and after `refresh()`. With `initial`
 * nothing is fetched up front (stories).
 */
export function useLiveShoppingItems(
  query: ShoppingItemQuery,
  { initial, intervalMs = null }: { initial?: ShoppingItem[]; intervalMs?: number | null } = {},
) {
  const [items, setItems] = React.useState<ShoppingItem[] | null>(initial ?? null);
  const [failed, setFailed] = React.useState(false);
  const key = JSON.stringify(query);

  const refresh = React.useCallback(async () => {
    try {
      setItems(await fetchShoppingItems(JSON.parse(key) as ShoppingItemQuery));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [key]);

  React.useEffect(() => {
    if (!initial) void refresh();
    // `initial` only seeds the first render, so it is not a dependency.
  }, [refresh]);

  useRefreshWhileVisible(() => void refresh(), intervalMs, !initial);

  return { items, setItems, failed, refresh };
}

/**
 * Products and shops for pickers in embedded components; `loading` until both arrived (pickers show
 * placeholders meanwhile). With `initial` nothing is fetched (stories).
 */
export function useShoppingCatalog(initial?: { products?: Product[]; shops?: Shop[] }) {
  const [products, setProducts] = React.useState<Product[]>(initial?.products ?? []);
  const [shops, setShops] = React.useState<Shop[]>(initial?.shops ?? []);
  const seeded = Boolean(initial);
  const [loading, setLoading] = React.useState(!seeded);

  React.useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    void Promise.all([fetchProducts().catch(() => []), fetchShops().catch(() => [])]).then(([nextProducts, nextShops]) => {
      if (cancelled) return;
      setProducts(nextProducts);
      setShops(nextShops);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [seeded]);

  return { products, shops, loading };
}
