import { db } from "@/lib/db";

/** Tenant branding: overrides the --brand token with the organization's colour. */
export async function BrandStyle({ organizationId }: { organizationId: string | null }) {
  if (!organizationId) return null;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { brandColor: true } });
  const color = org?.brandColor;
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return <style>{`:root{--brand:${color};}`}</style>;
}
