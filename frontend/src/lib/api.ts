/**
 * Tiny fetch wrapper for the FastAPI backend (same origin, cookie session).
 *
 *   const { user } = await api<{ user: User }>("/api/me");
 *   await api("/api/me", { method: "PUT", body: { name } });
 *   await api(`/api/children/${id}/photo`, { method: "PUT", form });
 *   const pdf = await apiBlob(`/api/children/${id}/reports/pdf`, { report_type: "full" });
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

/**
 * The one fetch call behind api() and apiBlob(): same-origin cookie session (the
 * backend's CSRF guard checks Origin on mutating requests, which the browser sets),
 * JSON or multipart body, and NETWORK for transport failures. Aborts are rethrown.
 */
async function send(url: string, init: ApiInit, accept: string): Promise<Response> {
  const hasBody = init.body !== undefined;
  try {
    return await fetch(withQuery(url, init.query), {
      method: init.method ?? (hasBody || init.form ? "POST" : "GET"),
      headers: init.form ? { Accept: accept } : hasBody ? { "Content-Type": "application/json", Accept: accept } : { Accept: accept },
      body: init.form ?? (hasBody ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Network error", 0);
  }
}

/** Parse a response body as JSON; undefined when it is empty or not JSON. */
async function readJson(res: Response): Promise<unknown> {
  const text = res.status === 204 ? "" : await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** ApiError from a non-OK response and its parsed body (the envelope, when there is one); notifies 401 listeners. */
function failure(url: string, res: Response, data: unknown, codes: Record<number, string> = STATUS_CODES): ApiError {
  const err = (data as { error?: { code?: unknown; message?: unknown; details?: unknown } } | undefined)?.error;
  const code = typeof err?.code === "string" ? err.code : (codes[res.status] ?? "INTERNAL");
  const message = typeof err?.message === "string" ? err.message : res.statusText || "Request failed";
  if (res.status === 401 && !url.startsWith("/api/auth/login")) unauthenticatedListeners.forEach((l) => l());
  return new ApiError(code, message, res.status, err?.details);
}

export async function api<T = unknown>(url: string, init: ApiInit = {}): Promise<T> {
  const res = await send(url, init, "application/json");
  const data = await readJson(res);
  if (!res.ok) throw failure(url, res, data);
  return data as T;
}

/** Without an error envelope a 503 on a file download is not about content creation. */
const BLOB_STATUS_CODES: Record<number, string> = { ...STATUS_CODES, 503: "INTERNAL" };

export type ApiBlobInit = Omit<ApiInit, "body" | "form"> & {
  /** Accept header; the server answers errors as JSON either way. Default "application/pdf, application/json". */
  accept?: string;
};

export type BlobResponse = {
  blob: Blob;
  /** From Content-Disposition (`filename*=UTF-8''…` or `filename="…"`), else null. Never a server path. */
  filename: string | null;
  /** The response Content-Type without parameters, e.g. "application/pdf". */
  contentType: string;
};

/**
 * File name from a Content-Disposition header. Prefers RFC 5987 `filename*`, keeps
 * only the last path segment and drops control characters, so a header can never
 * steer the download into a folder.
 */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  let name: string | null = null;
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      name = decodeURIComponent(star[2]!.trim().replace(/^"|"$/g, ""));
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*("((?:[^"\\]|\\.)*)"|[^;]+)/i.exec(header);
    if (plain) name = (plain[2] !== undefined ? plain[2].replace(/\\(.)/g, "$1") : plain[1]!).trim();
  }
  if (!name) return null;
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop()!.trim();
  return name && name !== "." && name !== ".." ? name : null;
}

/**
 * Like apiBlob(), plus the file name and type from the response headers.
 * A JSON body is POSTed (method overridable); without one it is a GET.
 */
export async function apiBlobResponse(url: string, body?: unknown, init: ApiBlobInit = {}): Promise<BlobResponse> {
  const res = await send(url, { ...init, body }, init.accept ?? "application/pdf, application/json");
  if (!res.ok) throw failure(url, res, await readJson(res), BLOB_STATUS_CODES);
  const contentType = (res.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  let raw: Blob;
  try {
    raw = await res.blob();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Network error", 0);
  }
  // Some runtimes (jsdom under Node) hand back a Blob from another realm: rewrap it so `instanceof Blob` holds.
  const foreign = raw as Blob;
  const blob = raw instanceof Blob ? raw : new Blob([await foreign.arrayBuffer()], { type: contentType || foreign.type });
  return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition")), contentType };
}

/**
 * Binary download (the PDF reports) with the same session, CSRF and error-envelope
 * handling as api(): a 4xx/5xx JSON envelope is thrown as ApiError (e.g. REPORT_BUSY),
 * a 401 signs the user out, and a transport failure is NETWORK.
 *
 *   const blob = await apiBlob(`/api/children/${id}/reports/pdf`, { report_type: "full", language });
 *   saveBlob(blob, "kidsphere-full.pdf");
 *
 * Nothing is written to disk and no URL is kept: see saveBlob() for the object URL.
 */
export async function apiBlob(url: string, body?: unknown, init: ApiBlobInit = {}): Promise<Blob> {
  return (await apiBlobResponse(url, body, init)).blob;
}

/** How long a download's object URL stays alive after the click (some browsers read it asynchronously). */
export const OBJECT_URL_TTL_MS = 1000;

/**
 * Save a Blob as a file: object URL → hidden <a download> click → URL revoked after
 * OBJECT_URL_TTL_MS. Returns a function that revokes it immediately (idempotent),
 * e.g. on unmount.
 */
export function saveBlob(blob: Blob, filename: string, doc: Document = document): () => void {
  const href = URL.createObjectURL(blob);
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    clearTimeout(timer);
    URL.revokeObjectURL(href);
  };
  const a = doc.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.hidden = true;
  doc.body.appendChild(a);
  const timer = setTimeout(revoke, OBJECT_URL_TTL_MS);
  try {
    a.click();
  } finally {
    a.remove();
  }
  return revoke;
}

/**
 * apiBlobResponse() + saveBlob(): downloads and saves the file under the server's
 * name, else `fallbackName`. Resolves with the saved name and the revoke function.
 */
export async function apiDownload(
  url: string,
  body: unknown,
  fallbackName: string,
  init: ApiBlobInit = {},
): Promise<{ filename: string; revoke: () => void }> {
  const res = await apiBlobResponse(url, body, init);
  const filename = res.filename ?? fallbackName;
  return { filename, revoke: saveBlob(res.blob, filename) };
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
