import { useCallback, useEffect, useState } from "react";
import { api, ApiError, withQuery, type Query } from "./api";

export type FetchState<T> = {
  data: T | undefined;
  error: ApiError | null;
  /** True while a request is in flight (also during reload; previous data stays visible). */
  loading: boolean;
  reload: () => void;
  /** Optimistic local update of the cached data. */
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
};

/**
 * GET a JSON resource and keep it in state.
 *
 *   const { data, error, loading, reload } = useFetch<{ children: Child[] }>("/api/children", { q });
 *
 * Pass `null` as url to skip fetching. The request is aborted on unmount or
 * when the url/query changes.
 */
export function useFetch<T>(url: string | null, query?: Query): FetchState<T> {
  const fullUrl = url === null ? null : withQuery(url, query);
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(fullUrl !== null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (fullUrl === null) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(fullUrl, { signal: ctrl.signal })
      .then((d) => {
        if (!ctrl.signal.aborted) setDataState(d);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), 0));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [fullUrl, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);

  return { data, error, loading, reload, setData };
}
