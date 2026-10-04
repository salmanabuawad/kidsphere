import "server-only";
import { headers } from "next/headers";
import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import type { changePasswordSchema, loginSchema, resetSchema, updateMeSchema } from "@/server/validators";

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(input: z.infer<typeof loginSchema>) {
  const ip = await clientKey();
  const key = `login:${input.email}:${ip}`;
  if (!rateLimit(key, 8, 15 * 60_000)) throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Please wait and try again.");

  const user = await db.user.findUnique({ where: { email: input.email } });
  // Always run bcrypt so response time does not reveal whether the email exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!user || !ok || !user.isActive) {
    await audit(user ? { userId: user.id, role: user.role, organizationId: user.organizationId } : null, "auth.login_failed", "User", user?.id ?? null, {});
    throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
  }
  resetRateLimit(key);
  const h = await headers();
  await createSession(user.id, h.get("user-agent"));
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, role: user.role, organizationId: user.organizationId }, "auth.login", "User", user.id, {});
  return user;
}

export async function logout(actor: Actor | null) {
  await destroySession();
  if (actor) await audit(actor, "auth.logout", "User", actor.userId, {});
}

/** Always responds the same way, whether or not the email exists. */
export async function requestPasswordReset(email: string) {
  const ip = await clientKey();
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000)) throw new AppError("RATE_LIMITED", "Too many requests. Please wait and try again.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;
  const token = newToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
  });
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  await sendMail({
    to: user.email,
    subject: "Kidsphere password reset",
    text: `Use this link within one hour to choose a new password: ${appUrl}/reset-password?token=${token}`,
  });
  await audit({ userId: user.id, role: user.role, organizationId: user.organizationId }, "auth.password_reset_requested", "User", user.id, {});
}

export async function resetPassword(input: z.infer<typeof resetSchema>) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("VALIDATION", "This reset link is invalid or has expired. Please request a new one.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(input.password) } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await audit(
      { userId: record.user.id, role: record.user.role, organizationId: record.user.organizationId },
      "auth.password_reset",
      "User",
      record.userId,
      {},
      tx,
    );
  });
}

export async function changePassword(actor: Actor, input: z.infer<typeof changePasswordSchema>) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new AppError("VALIDATION", "Current password is incorrect.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await audit(actor, "user.update", "User", user.id, { fields: ["password"] });
}

/** Self-service profile update. The schema has no `role` field, so a user can never promote themselves. */
export async function updateMe(actor: Actor, input: z.infer<typeof updateMeSchema>) {
  const updated = await db.user.update({ where: { id: actor.userId }, data: { name: input.name, uiLocale: input.uiLocale } });
  await audit(actor, "user.update", "User", actor.userId, { fields: Object.keys(input) });
  return { id: updated.id, name: updated.name, uiLocale: updated.uiLocale };
}
