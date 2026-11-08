import { useCallback, useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import { useLiveEvents } from "@/lib/live-events";

/** Invalidate composed views after owner commits, coalescing a whole workflow's events. */
export function useLinkedRecordRefresh() {
  const revalidator = useRevalidator();
  const current = useRef(revalidator);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  useEffect(() => { current.current = revalidator; });
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (current.current.state === "idle") void current.current.revalidate();
      else pending.current = true;
    }, 200);
  }, []);
  useEffect(() => { if (revalidator.state === "idle" && pending.current) { pending.current = false; refresh(); } }, [revalidator.state, refresh]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLiveEvents("records.changed", refresh);
  useLiveEvents("shopping.changed", refresh);
  useLiveEvents("expenses.changed", refresh);
  useLiveEvents("projects.changed", refresh);
  useLiveEvents("documents.changed", refresh);
  useLiveEvents("device.changed", refresh);
  useLiveEvents("ready", refresh);
}
