/**
 * ContentGenerationContextBuilder — AI data minimization.
 *
 * Input: child, goal, requested content type (+ teacher choices).
 * Output: the minimum set of approved fields needed for that generation.
 *
 * It reads ONLY: the child's display name and age band, the goal, ACTIVE
 * profile attributes in four categories (interest/strength/support/trigger),
 * and consented character assets. It never reads parent questionnaire
 * responses, observations, health data, last names or birth dates.
 */
import type { AttributeCategory, ConfidenceLevel, ContentType, Locale, PersonRelation } from "@prisma/client";
import type { Db, Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { ageBand } from "@/lib/utils";
import type { GenerationContext } from "@/lib/ai/types";
import { evaluateConsent } from "@/features/consent/evaluate";

const RANK: Record<ConfidenceLevel, number> = { CORROBORATED: 3, OBSERVED: 2, REPORTED: 1, EMERGING: 0, RETIRED: -1 };

export const PROPOSAL_LIMITS = { interests: 2, strengths: 2, supports: 3, avoid: 3 } as const;

export type Proposals = { interests: string[]; strengths: string[]; supports: string[]; avoid: string[] };

export type CharacterOption = { id: string; label: string; relation: PersonRelation; consentId: string };

const RELATION_LABEL: Record<PersonRelation, string> = {
  CHILD: "the child",
  MOTHER: "Mom",
  FATHER: "Dad",
  SIBLING: "sibling",
  GRANDPARENT: "grandparent",
  FAMILY_MEMBER: "family member",
  FRIEND: "friend",
};

export type BuildOptions = {
  contentType: ContentType;
  language: Locale;
  durationMinutes: number;
  theme: string | null;
  difficulty?: number;
  teacherInstruction: string | null;
  /** Teacher's selection. `undefined` = use the system proposal. */
  include?: Proposals;
  characterAssetIds: string[];
};

export class ContentGenerationContextBuilder {
  constructor(private client: Db | Tx) {}

  /** What Kidsphere proposes to personalize with — only ACTIVE (teacher-usable) attributes. */
  async proposals(childId: string): Promise<{ proposals: Proposals; available: Proposals }> {
    const attrs = await this.client.profileAttribute.findMany({
      where: { childId, status: "ACTIVE", category: { in: ["INTEREST", "STRENGTH", "SUPPORT", "TRIGGER"] } },
      include: { _count: { select: { evidence: true } } },
    });
    const sorted = (category: AttributeCategory) =>
      attrs
        .filter((a) => a.category === category)
        .sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b._count.evidence - a._count.evidence)
        .map((a) => a.value);
    const available: Proposals = {
      interests: sorted("INTEREST"),
      strengths: sorted("STRENGTH"),
      supports: sorted("SUPPORT"),
      avoid: sorted("TRIGGER"),
    };
    return {
      available,
      proposals: {
        interests: available.interests.slice(0, PROPOSAL_LIMITS.interests),
        strengths: available.strengths.slice(0, PROPOSAL_LIMITS.strengths),
        supports: available.supports.slice(0, PROPOSAL_LIMITS.supports),
        avoid: available.avoid.slice(0, PROPOSAL_LIMITS.avoid),
      },
    };
  }

  /** Characters whose consent currently allows use for this content type. */
  async selectableCharacters(childId: string, contentType: ContentType | null): Promise<CharacterOption[]> {
    const assets = await this.client.mediaAsset.findMany({
      where: { childId, deletedAt: null },
      include: { consents: true },
      orderBy: { createdAt: "asc" },
    });
    const out: CharacterOption[] = [];
    for (const a of assets) {
      const decision = evaluateConsent(a.consents, "CHARACTER_INSPIRATION", contentType);
      const consent = a.consents.find((c) => c.status === "GRANTED" && !c.revokedAt);
      if (decision.allowed && consent) out.push({ id: a.id, label: a.personLabel, relation: a.personRelation, consentId: consent.id });
    }
    return out;
  }

  async build(childId: string, goalId: string, opts: BuildOptions): Promise<{ context: GenerationContext; characters: CharacterOption[] }> {
    const child = await this.client.child.findUnique({
      where: { id: childId },
      select: { id: true, displayName: true, dateOfBirth: true, organizationId: true },
    });
    const goal = await this.client.goal.findFirst({ where: { id: goalId, childId } });
    if (!child || !goal) throw new AppError("NOT_FOUND", "Child or goal not found");
    if (goal.status !== "ACTIVE") throw new AppError("INVALID_TRANSITION", "Content can only be generated for an active goal.");

    const org = await this.client.organization.findUnique({ where: { id: child.organizationId }, select: { enabledLocales: true } });
    if (org && !org.enabledLocales.includes(opts.language)) {
      throw new AppError("VALIDATION", "This content language is not enabled for your organization.");
    }

    const { proposals, available } = await this.proposals(childId);
    const include = opts.include ?? proposals;
    // A teacher can remove items, never inject ones that are not confirmed in the profile.
    const subset = (wanted: string[], allowed: string[], limit: number) => {
      const bad = wanted.filter((w) => !allowed.includes(w));
      if (bad.length) throw new AppError("VALIDATION", "Personalization can only use confirmed profile items.", { items: bad });
      return [...new Set(wanted)].slice(0, limit);
    };

    const characters: CharacterOption[] = [];
    if (opts.characterAssetIds.length) {
      const assets = await this.client.mediaAsset.findMany({
        where: { id: { in: opts.characterAssetIds }, childId },
        include: { consents: true },
      });
      for (const id of opts.characterAssetIds) {
        const a = assets.find((x) => x.id === id);
        if (!a) throw new AppError("NOT_FOUND", "Character image not found");
        const decision = evaluateConsent(a.consents, "CHARACTER_INSPIRATION", opts.contentType, !!a.deletedAt);
        if (!decision.allowed) {
          throw new AppError(
            decision.reason === "REVOKED" || decision.reason === "ASSET_DELETED" ? "CONSENT_REVOKED" : "CONSENT_REQUIRED",
            "This character image cannot be used: the family has not given (or has withdrawn) consent for this use.",
          );
        }
        const consent = a.consents.find((c) => c.status === "GRANTED" && !c.revokedAt)!;
        characters.push({ id: a.id, label: a.personLabel, relation: a.personRelation, consentId: consent.id });
      }
    }

    const context: GenerationContext = {
      childDisplayName: child.displayName,
      ageBand: ageBand(child.dateOfBirth),
      contentLanguage: opts.language,
      goalId: goal.id,
      goal: goal.statement,
      successIndicator: goal.successIndicator,
      interests: subset(include.interests, available.interests, PROPOSAL_LIMITS.interests),
      strengths: subset(include.strengths, available.strengths, PROPOSAL_LIMITS.strengths),
      supports: subset(include.supports, available.supports, PROPOSAL_LIMITS.supports),
      avoid: subset(include.avoid, available.avoid, PROPOSAL_LIMITS.avoid),
      // Relation-based labels only: family member names are never sent to the provider.
      approvedCharacters: characters.map((c) => ({
        id: c.id,
        label: c.relation === "CHILD" ? child.displayName : RELATION_LABEL[c.relation],
        relation: c.relation,
      })),
      format: opts.contentType,
      durationMinutes: opts.durationMinutes,
      theme: opts.theme,
      difficulty: Math.min(3, Math.max(1, opts.difficulty ?? 2)),
      teacherInstruction: opts.teacherInstruction,
    };
    return { context, characters };
  }
}
