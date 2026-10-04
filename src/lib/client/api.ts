"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
      headers: init.form ? undefined : init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("NETWORK", "Network error", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(err?.code ?? "INTERNAL", err?.message ?? "Request failed", res.status, err?.details);
  }
  return data as T;
}

const KNOWN = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "STALE_EDIT",
  "DUPLICATE",
  "GOAL_LIMIT",
  "INVALID_TRANSITION",
  "CONSENT_REQUIRED",
  "CONSENT_REVOKED",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_INVALID_OUTPUT",
  "UPLOAD_FAILED",
  "RATE_LIMITED",
  "LOCKED",
  "NETWORK",
  "INTERNAL",
]);

/** Translate an API error into an actionable, localized message. */
export function useErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (e: unknown) => {
      if (e instanceof ApiClientError) {
        const code = KNOWN.has(e.code) ? e.code : "INTERNAL";
        return t(`errors.${code}` as MessageKey);
      }
      return t("errors.INTERNAL");
    },
    [t],
  );
}

/** Run a mutation with pending state, localized error toast and optional router refresh. */
export function useAction() {
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts: { success?: string; refresh?: boolean; onError?: (e: unknown) => void } = {}): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();
        if (opts.success) toast(opts.success);
        if (opts.refresh !== false) router.refresh();
        return result;
      } catch (e) {
        opts.onError?.(e);
        toast(errorMessage(e), "error");
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router, errorMessage],
  );
  return { pending, run };
}
