import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { type Actor, homePathFor } from "./actor";
import { CHILD_COOKIE, SESSION_COOKIE, SESSION_TTL_MS, cookieOptions } from "./cookies";
import { hashToken, newToken } from "./tokens";

export async function createSession(userId: string, userAgent?: string | null) {
  const token = newToken();
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/**
 * Resolve the current adult from the session cookie.
 *
 * While a child-mode session is active on this device the adult session is
 * deliberately treated as absent: the device is "locked" to the child player
 * until an adult exits with their PIN. This is what keeps the child player
 * from reaching teacher/parent endpoints even though the adult cookie exists.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  if (jar.get(CHILD_COOKIE)?.value) return null;
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const u = session.user;
  return {
    userId: u.id,
    role: u.role,
    organizationId: u.organizationId,
    kindergartenId: u.kindergartenId,
    name: u.name,
    email: u.email,
    uiLocale: u.uiLocale,
  };
});

/** For API routes: throws typed errors (401/403). */
export async function requireActor(roles?: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in");
  if (roles && !roles.includes(actor.role)) throw new AppError("FORBIDDEN");
  return actor;
}

/** For pages: redirects instead of throwing. */
export async function requirePageActor(roles?: Role[]): Promise<Actor> {
  const jar = await cookies();
  if (jar.get(CHILD_COOKIE)?.value) redirect("/play");
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (roles && !roles.includes(actor.role)) redirect(homePathFor(actor.role));
  return actor;
}
