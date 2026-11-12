import * as React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { useLiveEvents } from "@/lib/live-events";
import type { XtraListSnapshot, XtraStatus } from "../types/xtra";
import { useRefreshWhileVisible } from "./use-live-shopping";
import { xtraClient } from "./xtra-requests";

export type XtraListInitial = { status: XtraStatus; snapshot?: XtraListSnapshot; error?: "unavailable" | "reconnect" };
export function useXtraList({ initial, intervalMs = 30000, client = xtraClient }: { initial?: XtraListInitial; intervalMs?: number | null; client?: Pick<typeof xtraClient, "status" | "list"> } = {}) {
  const [status, setStatus] = React.useState(initial?.status ?? null);
  const [snapshot, setSnapshot] = React.useState(initial?.snapshot ?? null);
  const [error, setError] = React.useState<"unavailable" | "reconnect" | null>(initial?.error ?? null);
  const [loading, setLoading] = React.useState(false);
  const lifecycle = React.useRef({ mounted: false, busy: false, epoch: 0, queued: false });
  const refresh = React.useCallback(async function run(fresh = false) {
    const life = lifecycle.current;
    if (!life.mounted) return;
    if (life.busy) { if (fresh) life.queued = true; return; }
    const epoch = life.epoch;
    const current = () => life.mounted && life.epoch === epoch;
    life.busy = true; setLoading(true);
    try {
      const next = await client.status();
      if (!current()) return;
      setStatus(next);
      if (!next.connected || !next.canUse) { setSnapshot(null); setError(null); return; }
      if (next.needsReconnect) { setError("reconnect"); return; }
      const data = await client.list(fresh);
      if (current()) { setSnapshot(data); setError(null); }
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof ApiRequestError && [401, 403].includes(cause.status)) { setSnapshot(null); setStatus(null); setError(null); }
      else setError(cause instanceof ApiRequestError && cause.code === "xtra_reconnect" ? "reconnect" : "unavailable");
    } finally {
      life.busy = false;
      if (current()) setLoading(false);
      if (life.mounted && life.queued) { life.queued = false; void run(true); }
    }
  }, [client]);
  React.useEffect(() => {
    const life = { mounted: true, busy: false, epoch: 0, queued: false };
    lifecycle.current = life;
    if (!initial) void refresh(true);
    return () => { life.mounted = false; life.epoch++; };
  }, [initial, refresh]);
  useRefreshWhileVisible(() => void refresh(), intervalMs, !initial);
  useLiveEvents("ready", () => void refresh(), { enabled: !initial });
  useLiveEvents<{ reason: string }>("shopping.xtra_changed", ({ reason }) => {
    if (reason === "access" || reason === "connection") { lifecycle.current.epoch++; setSnapshot(null); }
    if (document.visibilityState === "visible") void refresh(true);
  }, { enabled: !initial });
  return { status, snapshot, error, loading, refresh };
}
