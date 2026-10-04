/**
 * Typed application errors. Route handlers convert these into JSON responses
 * with a stable `code` the UI can translate; stack traces never leave the server.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "STALE_EDIT"
  | "DUPLICATE"
  | "GOAL_LIMIT"
  | "INVALID_TRANSITION"
  | "CONSENT_REQUIRED"
  | "CONSENT_REVOKED"
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_INVALID_OUTPUT"
  | "UPLOAD_FAILED"
  | "RATE_LIMITED"
  | "LOCKED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  STALE_EDIT: 409,
  DUPLICATE: 409,
  GOAL_LIMIT: 422,
  INVALID_TRANSITION: 422,
  CONSENT_REQUIRED: 422,
  CONSENT_REVOKED: 410,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_INVALID_OUTPUT: 502,
  UPLOAD_FAILED: 400,
  RATE_LIMITED: 429,
  LOCKED: 423,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.status = STATUS[code];
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You do not have access to this resource") => new AppError("FORBIDDEN", message);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
