import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

/** Optional owner contributions retain their data on refresh and never show a previous record's data. */
export function useAsyncResource<T>(key: string, load: () => Promise<T>, options: { initial?: T; enabled?: boolean } = {}) {
  const { initial, enabled = true } = options;
  const revalidator = useRevalidator();
  const latest = useRef(load);
  useEffect(() => { latest.current = load; });
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: boolean }>({ key, data: initial ?? null, error: false });
  useEffect(() => {
    if (!enabled || initial !== undefined || revalidator.state !== "idle") return;
    let active = true;
    latest.current().then((data) => { if (active) setState({ key, data, error: false }); }).catch(() => {
      if (active) setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: true }));
    });
    return () => { active = false; };
  }, [key, enabled, initial, version, revalidator.state]);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const data = initial ?? (state.key === key ? state.data : null);
  return { data, error: state.key === key && state.error, loading: enabled && data === null && !state.error, refresh };
}
