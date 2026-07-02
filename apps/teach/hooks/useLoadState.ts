import { useCallback, useEffect, useRef, useState } from "react";

export type LoadStatus = "loading" | "error" | "ready";

export type LoadState<T> = {
  status: LoadStatus;
  data: T | null;
  error: Error | null;
  /** Full reload (shows the loading state). */
  reload: () => void;
  /** Pull-to-refresh (keeps current data visible). */
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * Standard screen data lifecycle: loading → ready | error(retry), plus
 * pull-to-refresh. Failed loads MUST surface an ErrorState — never fall back
 * to demo data or silently render empty.
 */
export function useLoadState<T>(fetcher: () => Promise<T>, deps: React.DependencyList = []): LoadState<T> {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const seq = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: "load" | "refresh") => {
      const mySeq = ++seq.current;
      if (mode === "load") setStatus("loading");
      else setRefreshing(true);
      try {
        const result = await fetcher();
        if (!alive.current || mySeq !== seq.current) return;
        setData(result);
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (!alive.current || mySeq !== seq.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        // keep stale data visible on refresh failures; hard-fail initial loads
        if (mode === "load") setStatus("error");
      } finally {
        if (alive.current && mySeq === seq.current) setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    void run("load");
  }, [run]);

  return {
    status,
    data,
    error,
    reload: () => void run("load"),
    refreshing,
    onRefresh: () => void run("refresh"),
  };
}
