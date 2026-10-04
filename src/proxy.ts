import { NextResponse, type NextRequest } from "next/server";

const CHILD_COOKIE = "ks_child";
const SESSION_COOKIE = "ks_session";

const CHILD_ALLOWED = [/^\/play(\/|$)/, /^\/api\/play\//, /^\/api\/child-mode\/exit$/, /^\/api\/health$/];
const PROTECTED_PAGES = [/^\/teacher(\/|$)/, /^\/parent(\/|$)/, /^\/admin(\/|$)/];

/**
 * Coarse routing guard (UX + defence in depth). Every route still performs its
 * own server-side authorization — this proxy is never the only check.
 *
 * Child-mode lock: while a child session cookie exists the device can only
 * reach the child player. Leaving requires the adult PIN (/api/child-mode/exit).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const inChildMode = !!req.cookies.get(CHILD_COOKIE)?.value;

  if (inChildMode) {
    if (CHILD_ALLOWED.some((r) => r.test(pathname))) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not available in child mode" } }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/play", req.url));
  }

  if (/^\/play(\/|$)/.test(pathname)) return NextResponse.redirect(new URL("/login", req.url));

  if (PROTECTED_PAGES.some((r) => r.test(pathname)) && !req.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
