import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeChild, authorizeContent, childScopeWhere } from "@/lib/permissions";
import { ALLOWED_AUDIO_TYPES, ALLOWED_IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, newStorageKey, sniffMatches, storage } from "@/lib/storage";
import { evaluateConsent } from "@/features/consent/evaluate";
import type { consentSchema, mediaMetaSchema } from "@/server/validators";
import type { ChildSessionInfo } from "./child-mode";

type UploadFile = { data: Buffer; type: string; size: number };

function checkFile(file: UploadFile, allowed: Record<string, string>, max: number): string {
  const ext = allowed[file.type];
  if (!ext) throw new AppError("UPLOAD_FAILED", "This file type is not supported.");
  if (file.size === 0) throw new AppError("UPLOAD_FAILED", "The file is empty.");
  if (file.size > max) throw new AppError("UPLOAD_FAILED", `The file is too large (max ${Math.round(max / 1024 / 1024)} MB).`);
  if (!sniffMatches(file.type, file.data)) throw new AppError("UPLOAD_FAILED", "The file content does not match its type.");
  return ext;
}

// ───────────────────────────── Media ─────────────────────────────

export async function uploadMedia(actor: Actor, childId: string, file: UploadFile, meta: z.infer<typeof mediaMetaSchema>) {
  const child = await authorizeChild(db, actor, childId, "parentContribute");
  const org = await db.organization.findUnique({ where: { id: child.organizationId }, select: { mediaEnabled: true } });
  if (org?.mediaEnabled === false) throw new AppError("FORBIDDEN", "Family photo characters are turned off for your kindergarten.");
  const ext = checkFile(file, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES);
  const key = newStorageKey(child.organizationId, "media", ext);
  try {
    await storage().put(key, file.data, file.type);
  } catch {
    throw new AppError("UPLOAD_FAILED", "The upload could not be stored. Please try again.");
  }
  const asset = await db.mediaAsset.create({
    data: {
      organizationId: child.organizationId,
      childId,
      uploadedById: actor.userId,
      storageKey: key,
      mimeType: file.type,
      sizeBytes: file.size,
      personRelation: meta.personRelation,
      personLabel: meta.personLabel,
    },
  });
  await audit(actor, "media.upload", "MediaAsset", asset.id, { childId, relation: meta.personRelation });
  return publicMedia(asset);
}

/** Strip the storage key — clients only ever see an id and an authorized URL. */
function publicMedia<T extends { id: string; storageKey: string }>(m: T) {
  const { storageKey: _omit, ...rest } = m;
  return { ...rest, url: `/api/media/${m.id}/file` };
}

export async function listMedia(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  const assets = await db.mediaAsset.findMany({
    where: { childId: child.id, deletedAt: null },
    include: { consents: { orderBy: { grantedAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  if (actor.role === "PARENT") return assets.map(publicMedia);
  // Staff only see assets that currently carry a valid consent.
  return assets.filter((a) => evaluateConsent(a.consents, "CHARACTER_INSPIRATION", null).allowed).map(publicMedia);
}

export async function deleteMedia(actor: Actor, mediaId: string) {
  const asset = await db.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null, child: childScopeWhere(actor) } });
  if (!asset) throw notFound("Media");
  await authorizeChild(db, actor, asset.childId, "parentContribute");
  await db.$transaction(async (tx) => {
    await tx.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
    await tx.mediaConsent.updateMany({
      where: { mediaAssetId: asset.id, status: "GRANTED" },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId },
    });
    await audit(actor, "media.delete", "MediaAsset", asset.id, { childId: asset.childId }, tx);
  });
  await storage()
    .delete(asset.storageKey)
    .catch(() => undefined);
}

/**
 * Authorized byte retrieval. Rules:
 * - parent of the child: own uploads (to manage them)
 * - staff in scope: only while a consent is GRANTED
 * - child session: only if used in content PUBLISHED for that child, and consent GRANTED
 * A revoked or deleted asset is therefore inaccessible to everyone but the owner family.
 */
export async function readMediaFile(viewer: { actor: Actor } | { child: ChildSessionInfo }, mediaId: string) {
  const asset = await db.mediaAsset.findUnique({ where: { id: mediaId }, include: { consents: true } });
  if (!asset || asset.deletedAt) throw notFound("Media");
  const consentOk = evaluateConsent(asset.consents, "CHARACTER_INSPIRATION", null).allowed;

  if ("actor" in viewer) {
    const { actor } = viewer;
    await authorizeChild(db, actor, asset.childId, "view");
    if (actor.role !== "PARENT" && !consentOk) throw new AppError("CONSENT_REVOKED", "This image is no longer available.");
  } else {
    if (viewer.child.childId !== asset.childId || !consentOk) throw notFound("Media");
    const used = await db.contentCharacter.count({ where: { mediaAssetId: asset.id, content: { status: "PUBLISHED", childId: asset.childId } } });
    if (!used) throw notFound("Media");
  }
  const data = await storage().get(asset.storageKey);
  if (!data) throw notFound("Media");
  return { data, mimeType: asset.mimeType };
}

// ───────────────────────────── Consent ─────────────────────────────

export async function createConsent(actor: Actor, childId: string, input: z.infer<typeof consentSchema>) {
  const child = await authorizeChild(db, actor, childId, "parentContribute");
  const asset = await db.mediaAsset.findFirst({ where: { id: input.mediaAssetId, childId: child.id, deletedAt: null } });
  if (!asset) throw notFound("Media");
  const existing = await db.mediaConsent.findFirst({ where: { mediaAssetId: asset.id, status: "GRANTED" } });
  if (existing) throw new AppError("DUPLICATE", "Consent is already granted for this image. Revoke it first to change it.");
  const consent = await db.mediaConsent.create({
    data: {
      organizationId: child.organizationId,
      childId: child.id,
      mediaAssetId: asset.id,
      grantedById: actor.userId,
      personRelation: input.personRelation,
      personLabel: input.personLabel,
      allowedPurposes: input.allowedPurposes,
      allowedContentTypes: input.allowedContentTypes,
    },
  });
  await audit(actor, "consent.create", "MediaConsent", consent.id, { mediaAssetId: asset.id, purposes: input.allowedPurposes });
  return consent;
}

export async function listConsents(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  return db.mediaConsent.findMany({ where: { childId: child.id }, orderBy: { grantedAt: "desc" } });
}

/** Parent revokes consent. Takes effect immediately for new generation and for display. */
export async function revokeConsent(actor: Actor, consentId: string) {
  const consent = await db.mediaConsent.findFirst({ where: { id: consentId, child: childScopeWhere(actor) } });
  if (!consent) throw notFound("Consent");
  await authorizeChild(db, actor, consent.childId, "parentContribute");
  if (consent.status === "REVOKED") return consent;
  const updated = await db.mediaConsent.update({
    where: { id: consent.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId },
  });
  await audit(actor, "consent.revoke", "MediaConsent", consent.id, { mediaAssetId: consent.mediaAssetId });
  return updated;
}

// ───────────────────────────── Narration ─────────────────────────────

export async function uploadNarration(actor: Actor, contentId: string, file: UploadFile, sceneId: string | null) {
  const content = await authorizeContent(db, actor, contentId, "edit");
  if (sceneId && !/^[a-z0-9_-]{1,40}$/i.test(sceneId)) throw new AppError("VALIDATION", "Invalid scene");
  const baseType = file.type.split(";")[0]!.trim();
  const ext = checkFile({ ...file, type: baseType }, ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES);
  const key = newStorageKey(content.organizationId, "narration", ext);
  try {
    await storage().put(key, file.data, baseType);
  } catch {
    throw new AppError("UPLOAD_FAILED", "The recording could not be stored. Please try again.");
  }
  const previous = await db.teacherNarration.findMany({ where: { contentId, sceneId } });
  const narration = await db.$transaction(async (tx) => {
    await tx.teacherNarration.deleteMany({ where: { contentId, sceneId } });
    const created = await tx.teacherNarration.create({
      data: {
        organizationId: content.organizationId,
        contentId,
        teacherId: actor.userId,
        sceneId,
        storageKey: key,
        mimeType: baseType,
        sizeBytes: file.size,
        // Narration on already-approved content is approved by the same teacher action;
        // on drafts it becomes approved together with the content.
        approved: content.status === "APPROVED" || content.status === "PUBLISHED",
      },
    });
    await audit(actor, "narration.upload", "TeacherNarration", created.id, { contentId, scene: sceneId ?? "all" }, tx);
    return created;
  });
  await Promise.all(
    previous.map((p) =>
      storage()
        .delete(p.storageKey)
        .catch(() => undefined),
    ),
  );
  const { storageKey: _k, ...rest } = narration;
  return { ...rest, url: `/api/narrations/${narration.id}/audio` };
}

export async function deleteNarration(actor: Actor, narrationId: string) {
  const n = await db.teacherNarration.findUnique({ where: { id: narrationId } });
  if (!n) throw notFound("Narration");
  await authorizeContent(db, actor, n.contentId, "edit");
  await db.teacherNarration.delete({ where: { id: n.id } });
  await audit(actor, "narration.delete", "TeacherNarration", n.id, { contentId: n.contentId });
  await storage()
    .delete(n.storageKey)
    .catch(() => undefined);
}

export async function readNarration(viewer: { actor: Actor } | { child: ChildSessionInfo }, narrationId: string) {
  const n = await db.teacherNarration.findUnique({ where: { id: narrationId }, include: { content: true } });
  if (!n) throw notFound("Narration");
  if ("actor" in viewer) {
    await authorizeContent(db, viewer.actor, n.contentId, "view");
    if (viewer.actor.role === "PARENT" && !n.approved) throw notFound("Narration");
  } else {
    const c = n.content;
    const forChild = c.childId === viewer.child.childId || (!c.childId && c.classId === viewer.child.classId);
    if (!n.approved || c.status !== "PUBLISHED" || !forChild) throw notFound("Narration");
  }
  const data = await storage().get(n.storageKey);
  if (!data) throw notFound("Narration");
  return { data, mimeType: n.mimeType };
}
