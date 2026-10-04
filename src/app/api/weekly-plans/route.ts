import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createWeeklyPlan, getWeeklyPlanView, listWeeklyPlans } from "@/server/services/weekly-plans";
import { weeklyPlanSchema } from "@/server/validators";

const STAFF = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER"] as const;
export const GET = authed(
  async (req, actor) => {
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId");
    const week = url.searchParams.get("weekStart");
    if (classId) return getWeeklyPlanView(actor, classId, week ? new Date(week) : undefined);
    return listWeeklyPlans(actor);
  },
  { roles: [...STAFF] },
);
export const POST = authed(async (req, actor) => createWeeklyPlan(actor, await parseBody(req, weeklyPlanSchema)), { roles: ["TEACHER"], status: 201 });
