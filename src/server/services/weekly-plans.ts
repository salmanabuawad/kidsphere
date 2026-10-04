import type { ContentType } from "@prisma/client";
import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { classScopeWhere, childScopeWhere } from "@/lib/permissions";
import { addDays, startOfWeek } from "@/lib/utils";
import type { planItemUpdateSchema, weeklyPlanSchema } from "@/server/validators";
import { generateForGoal } from "./content";

/**
 * Default weekly package for one goal — deliberately small (one item a day)
 * so the teacher stays in control. Friday replays Monday's story and is the
 * prompt to record an outcome.
 */
export const WEEKLY_PACKAGE: { day: number; type: ContentType; titleKey: string }[] = [
  { day: 1, type: "INTERACTIVE_STORY", titleKey: "short_story" },
  { day: 2, type: "VISUAL_ROUTINE", titleKey: "visual_card" },
  { day: 3, type: "CHOICE_ACTIVITY", titleKey: "choice_game" },
  { day: 4, type: "MOVEMENT_ACTIVITY", titleKey: "movement" },
  { day: 5, type: "INTERACTIVE_STORY", titleKey: "replay_outcome" },
];

async function assertClass(actor: Actor, classId: string) {
  const cls = await db.class.findFirst({ where: { AND: [{ id: classId }, classScopeWhere(actor)] } });
  if (!cls) throw notFound("Class");
  return cls;
}

export async function getWeeklyPlanView(actor: Actor, classId: string, weekStartInput?: Date) {
  const cls = await assertClass(actor, classId);
  const weekStart = startOfWeek(weekStartInput ?? new Date());
  const plan = await db.weeklyPlan.findFirst({
    where: { classId: cls.id, weekStart },
    include: { items: { include: { content: { select: { id: true, status: true, title: true } } }, orderBy: [{ dayOfWeek: "asc" }] } },
  });
  const children = await db.child.findMany({
    where: { AND: [{ classId: cls.id, archivedAt: null }, childScopeWhere(actor)] },
    orderBy: { firstName: "asc" },
    include: {
      goals: {
        where: { status: "ACTIVE" },
        include: { outcomes: { orderBy: { recordedAt: "desc" }, take: 1 } },
      },
    },
  });
  return {
    class: cls,
    weekStart,
    weekEnd: addDays(weekStart, 4),
    plan,
    children: children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      avatarColor: c.avatarColor,
      goals: c.goals.map((g) => ({
        id: g.id,
        statement: g.statement,
        reviewDate: g.reviewDate,
        lastOutcome: g.outcomes[0] ?? null,
        items: plan?.items.filter((i) => i.goalId === g.id) ?? [],
      })),
    })),
  };
}

export async function listWeeklyPlans(actor: Actor, classId?: string) {
  return db.weeklyPlan.findMany({
    where: { class: classScopeWhere(actor), ...(classId ? { classId } : {}) },
    include: { _count: { select: { items: true } }, class: { select: { name: true } } },
    orderBy: { weekStart: "desc" },
    take: 20,
  });
}

/** Create (or extend) the plan for a class/week, adding the default package for each selected goal. */
export async function createWeeklyPlan(actor: Actor, input: z.infer<typeof weeklyPlanSchema>) {
  if (actor.role !== "TEACHER") throw new AppError("FORBIDDEN");
  const cls = await assertClass(actor, input.classId);
  const weekStart = startOfWeek(input.weekStart);
  const goals = input.goalIds.length
    ? await db.goal.findMany({
        where: { id: { in: input.goalIds }, status: "ACTIVE", child: { AND: [{ classId: cls.id }, childScopeWhere(actor)] } },
      })
    : [];
  if (goals.length !== new Set(input.goalIds).size) throw new AppError("VALIDATION", "Some goals are not active goals of children in this class.");

  return db.$transaction(async (tx) => {
    const plan =
      (await tx.weeklyPlan.findFirst({ where: { classId: cls.id, weekStart } })) ??
      (await tx.weeklyPlan.create({
        data: { organizationId: cls.organizationId, classId: cls.id, weekStart, notes: input.notes, createdById: actor.userId },
      }));
    if (input.notes !== null && input.notes !== undefined) await tx.weeklyPlan.update({ where: { id: plan.id }, data: { notes: input.notes } });
    for (const g of goals) {
      const existing = await tx.weeklyPlanItem.count({ where: { weeklyPlanId: plan.id, goalId: g.id } });
      if (existing > 0) continue; // never duplicate a package
      await tx.weeklyPlanItem.createMany({
        data: WEEKLY_PACKAGE.map((p) => ({
          weeklyPlanId: plan.id,
          childId: g.childId,
          goalId: g.id,
          dayOfWeek: p.day,
          contentType: p.type,
          title: p.titleKey,
        })),
      });
    }
    await audit(actor, "weekly_plan.create", "WeeklyPlan", plan.id, { classId: cls.id, goals: goals.length }, tx);
    return plan;
  });
}

async function loadItem(actor: Actor, itemId: string) {
  const item = await db.weeklyPlanItem.findFirst({
    where: { id: itemId, plan: { class: classScopeWhere(actor) } },
    include: { plan: true },
  });
  if (!item) throw notFound("Plan item");
  return item;
}

/** Generate a draft for one plan item using the goal's default personalization proposal. */
export async function generatePlanItem(actor: Actor, itemId: string, language?: "ar" | "he" | "en") {
  const item = await loadItem(actor, itemId);
  if (!item.goalId) throw new AppError("VALIDATION", "This plan item has no goal");
  if (item.contentId) return item;

  // Friday replays Monday's story rather than generating more content.
  if (item.dayOfWeek === 5) {
    const monday = await db.weeklyPlanItem.findFirst({
      where: { weeklyPlanId: item.weeklyPlanId, goalId: item.goalId, dayOfWeek: 1, contentId: { not: null } },
    });
    if (monday?.contentId) {
      return db.weeklyPlanItem.update({ where: { id: item.id }, data: { contentId: monday.contentId, status: "READY" } });
    }
  }
  const child = await db.child.findUniqueOrThrow({ where: { id: item.childId } });
  const content = await generateForGoal(actor, item.goalId, {
    contentType: item.contentType,
    language: language ?? child.primaryLanguage,
    durationMinutes: 5,
    theme: null,
    characterAssetIds: [],
    teacherInstruction: null,
  });
  return db.weeklyPlanItem.update({ where: { id: item.id }, data: { contentId: content.id, status: "READY" } });
}

export async function updatePlanItem(actor: Actor, itemId: string, input: z.infer<typeof planItemUpdateSchema>) {
  const item = await loadItem(actor, itemId);
  return db.weeklyPlanItem.update({ where: { id: item.id }, data: { status: input.status } });
}
