/**
 * Tiny fetch wrapper for the FastAPI backend (same origin, cookie session).
 *
 *   const { user } = await api<{ user: User }>("/api/me");
 *   await api("/api/me", { method: "PUT", body: { name } });
 *   await api(`/api/children/${id}/photo`, { method: "PUT", form });
 *
 * Errors use the backend envelope {error:{code,message,details}} and are thrown
 * as ApiError. Show them with useErrorMessage() / errorMessage(), which map
 * `code` to the localized `errors.<CODE>` string.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export type ApiInit = {
  /** Defaults to POST when there is a body or form, else GET. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body. */
  body?: unknown;
  /** Multipart body (uploads). */
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
};

/** Append a query string, skipping null/undefined/"" values. */
export function withQuery(url: string, query?: Query): string {
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
  const s = qs.toString();
  return s ? `${url}${url.includes("?") ? "&" : "?"}${s}` : url;
}

type Listener = () => void;
const unauthenticatedListeners = new Set<Listener>();

/** Called whenever an API call returns 401 (the session expired or was revoked). Returns an unsubscribe function. */
export function onUnauthenticated(fn: Listener): () => void {
  unauthenticatedListeners.add(fn);
  return () => unauthenticatedListeners.delete(fn);
}

const STATUS_CODES: Record<number, string> = {
  400: "VALIDATION",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "DUPLICATE",
  413: "UPLOAD_FAILED",
  422: "VALIDATION",
  429: "RATE_LIMITED",
  503: "AI_UNAVAILABLE",
};

export async function api<T = unknown>(url: string, init: ApiInit = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(withQuery(url, init.query), {
      method: init.method ?? (hasBody || init.form ? "POST" : "GET"),
      headers: init.form ? { Accept: "application/json" } : hasBody ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: init.form ?? (hasBody ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Network error", 0);
  }

  const text = res.status === 204 ? "" : await res.text().catch(() => "");
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: unknown; message?: unknown; details?: unknown } } | undefined)?.error;
    const code = typeof err?.code === "string" ? err.code : (STATUS_CODES[res.status] ?? "INTERNAL");
    const message = typeof err?.message === "string" ? err.message : res.statusText || "Request failed";
    if (res.status === 401 && !url.startsWith("/api/auth/login")) unauthenticatedListeners.forEach((l) => l());
    throw new ApiError(code, message, res.status, err?.details);
  }
  return data as T;
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

/** Minimal translator shape (see i18n/translate.ts) so this module stays free of React. */
type TranslatorLike = { t: (key: string, vars?: Record<string, string | number>) => string; has: (key: string) => boolean };

/** Localized, actionable message for any thrown value: `errors.<CODE>`, else `errors.INTERNAL`. */
export function errorMessage(e: unknown, tr: TranslatorLike): string {
  const code = e instanceof ApiError ? e.code : "INTERNAL";
  const key = `errors.${code}`;
  return tr.has(key) ? tr.t(key) : tr.t("errors.INTERNAL");
}

/**
 * Field errors from a 400 VALIDATION response: details [{path, message}] →
 * {"name": "...", "plan.need": "..."}. Paths may be arrays or dotted strings.
 */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: unknown; loc?: unknown; message?: unknown; msg?: unknown }[]) {
    const raw = d?.path ?? d?.loc;
    const path = Array.isArray(raw) ? raw.filter((p) => p !== "body").join(".") : String(raw ?? "");
    const msg = d?.message ?? d?.msg;
    if (path && typeof msg === "string" && !(path in out)) out[path] = msg;
  }
  return out;
}
