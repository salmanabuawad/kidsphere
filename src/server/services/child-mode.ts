/**
 * Child device mode.
 *
 * An authorized adult launches a child session for one child and sets an exit
 * PIN. While the session cookie exists, the device is locked to /play (see
 * proxy.ts and getActor). The child session can only read PUBLISHED,
 * child-facing content for that child — it has no access to any adult API.
 */
import type { Actor } from "@/lib/auth/actor";
import { CHILD_SESSION_TTL_MS } from "@/lib/auth/cookies";
import { hashPin, verifyPin } from "@/lib/auth/password";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeChild } from "@/lib/permissions";
import { CHILD_FACING_KINDS, type ContentBody, KIND_BY_TYPE } from "@/lib/ai/schemas";
import { evaluateConsent } from "@/features/consent/evaluate";
import { isVisibleToChild } from "@/features/content/workflow";
import { publishedForChild } from "./content";

export type ChildSessionInfo = {
  sessionId: string;
  childId: string;
  classId: string | null;
  organizationId: string;
  displayName: string;
  avatarColor: string;
  primaryLanguage: "ar" | "he" | "en";
};

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export async function launchChildSession(actor: Actor, childId: string, pin: string): Promise<string> {
  const child = await authorizeChild(db, actor, childId, "view");
  const token = newToken();
  await db.childSession.create({
    data: {
      tokenHash: hashToken(token),
      organizationId: child.organizationId,
      childId: child.id,
      launchedById: actor.userId,
      pinHash: await hashPin(pin),
      expiresAt: new Date(Date.now() + CHILD_SESSION_TTL_MS),
    },
  });
  await audit(actor, "child_mode.launch", "Child", child.id, { role: actor.role });
  await track("child_mode_launched", child.organizationId, { role: actor.role });
  return token;
}

export async function resolveChildSession(token: string | undefined | null): Promise<ChildSessionInfo | null> {
  if (!token) return null;
  const s = await db.childSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { child: true } });
  if (!s || s.endedAt || s.expiresAt < new Date() || s.child.archivedAt) return null;
  return {
    sessionId: s.id,
    childId: s.childId,
    classId: s.child.classId,
    organizationId: s.organizationId,
    displayName: s.child.displayName,
    avatarColor: s.child.avatarColor,
    primaryLanguage: s.child.primaryLanguage,
  };
}

/** Verify the adult PIN and end the session. Repeated failures lock the exit briefly. */
export async function exitChildSession(token: string | undefined | null, pin: string) {
  if (!token) return;
  const s = await db.childSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!s || s.endedAt) return;
  const lastFail = await db.auditLog.findFirst({
    where: { action: "child_mode.pin_failed", objectId: s.id },
    orderBy: { createdAt: "desc" },
  });
  if (s.failedPinCount >= MAX_PIN_ATTEMPTS && lastFail && Date.now() - lastFail.createdAt.getTime() < LOCKOUT_MS) {
    throw new AppError("LOCKED", "Too many attempts. Please wait a minute and try again.");
  }
  if (!(await verifyPin(pin, s.pinHash))) {
    await db.childSession.update({ where: { id: s.id }, data: { failedPinCount: { increment: 1 } } });
    await audit({ userId: s.launchedById, role: "TEACHER", organizationId: s.organizationId }, "child_mode.pin_failed", "ChildSession", s.id, {
      attempts: s.failedPinCount + 1,
    });
    throw new AppError("FORBIDDEN", "That PIN is not correct.");
  }
  await db.childSession.update({ where: { id: s.id }, data: { endedAt: new Date() } });
  await audit({ userId: s.launchedById, role: "TEACHER", organizationId: s.organizationId }, "child_mode.exit", "ChildSession", s.id, {});
}

/** Home screen items for the child: published, child-facing content only. */
export async function childHome(info: ChildSessionInfo) {
  const items = await publishedForChild(info.childId, info.classId);
  return items.filter((i) => CHILD_FACING_KINDS.has(i.kind));
}

/** A single item for the player — re-checks every visibility rule server-side. */
export async function childContentItem(info: ChildSessionInfo, contentId: string) {
  const c = await db.contentAsset.findUnique({
    where: { id: contentId },
    include: {
      currentVersion: true,
      narrations: { where: { approved: true } },
      characters: { include: { media: { include: { consents: true } } } },
    },
  });
  const belongs = c && (c.childId === info.childId || (!c.childId && c.classId && c.classId === info.classId));
  if (!c || !belongs || !isVisibleToChild(c.status) || !CHILD_FACING_KINDS.has(KIND_BY_TYPE[c.type]) || !c.currentVersion) {
    throw notFound("Content");
  }
  return {
    id: c.id,
    type: c.type,
    language: c.language,
    body: c.currentVersion.body as unknown as ContentBody,
    narrations: c.narrations.map((n) => ({ id: n.id, sceneId: n.sceneId, url: `/api/play/narrations/${n.id}` })),
    // Characters whose consent was revoked fall back to the built-in illustration.
    characters: c.characters
      .filter((ch) => !ch.media.deletedAt && evaluateConsent(ch.media.consents, "CHARACTER_INSPIRATION", c.type).allowed)
      .map((ch) => ({ id: ch.mediaAssetId, url: `/api/play/media/${ch.mediaAssetId}` })),
  };
}
