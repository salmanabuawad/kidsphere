import type { ConsentPurpose, ConsentStatus, ContentType } from "@prisma/client";

export type ConsentLike = {
  status: ConsentStatus;
  allowedPurposes: ConsentPurpose[];
  allowedContentTypes: ContentType[];
  revokedAt: Date | null;
};

export type ConsentDecision =
  { allowed: true } | { allowed: false; reason: "NO_CONSENT" | "REVOKED" | "PURPOSE_NOT_ALLOWED" | "TYPE_NOT_ALLOWED" | "ASSET_DELETED" };

/**
 * A media asset may be used only when an explicit, un-revoked consent covers
 * both the purpose and the content type. Upload alone never implies consent.
 */
export function evaluateConsent(consents: ConsentLike[], purpose: ConsentPurpose, contentType: ContentType | null, assetDeleted = false): ConsentDecision {
  if (assetDeleted) return { allowed: false, reason: "ASSET_DELETED" };
  if (consents.length === 0) return { allowed: false, reason: "NO_CONSENT" };
  const active = consents.filter((c) => c.status === "GRANTED" && !c.revokedAt);
  if (active.length === 0) return { allowed: false, reason: "REVOKED" };
  const forPurpose = active.filter((c) => c.allowedPurposes.includes(purpose));
  if (forPurpose.length === 0) return { allowed: false, reason: "PURPOSE_NOT_ALLOWED" };
  if (contentType && !forPurpose.some((c) => c.allowedContentTypes.includes(contentType))) {
    return { allowed: false, reason: "TYPE_NOT_ALLOWED" };
  }
  return { allowed: true };
}
