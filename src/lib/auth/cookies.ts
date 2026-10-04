export const SESSION_COOKIE = "ks_session";
export const CHILD_COOKIE = "ks_child";
export const LOCALE_COOKIE = "ks_locale";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CHILD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
