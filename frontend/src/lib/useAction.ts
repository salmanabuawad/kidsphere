import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "./api";

/** Localized message for any error thrown by api(): `errors.<CODE>` or errors.INTERNAL. */
export function useErrorMessage(): (e: unknown) => string {
  const { t, has } = useI18n();
  return useCallback((e: unknown) => errorMessage(e, { t, has }), [t, has]);
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export type RunOptions<T> = {
  /** Toast shown on success (already translated). */
  success?: string;
  onSuccess?: (data: T) => void;
  onError?: (e: unknown) => void;
  /** Show the localized error toast (default true). Set false when the form shows the error inline. */
  errorToast?: boolean;
};

/**
 * Run a mutation with pending state, a success toast and a localized error toast.
 *
 *   const { pending, run } = useAction();
 *   const r = await run(() => api("/api/me", { method: "PUT", body }), { success: t("account.saved"), onSuccess: reload });
 *   if (r.ok) …
 */
export function useAction() {
  const toMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts: RunOptions<T> = {}): Promise<ActionResult<T>> => {
      setPending(true);
      try {
        const data = await fn();
        if (opts.success) toast(opts.success);
        opts.onSuccess?.(data);
        return { ok: true, data };
      } catch (error) {
        opts.onError?.(error);
        if (opts.errorToast !== false) toast(toMessage(error), "error");
        return { ok: false, error };
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [toMessage],
  );

  return { pending, run, errorMessage: toMessage };
}
