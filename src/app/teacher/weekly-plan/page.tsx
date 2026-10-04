import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { addDays, startOfWeek } from "@/lib/utils";
import { listClasses } from "@/server/services/children";
import { getWeeklyPlanView } from "@/server/services/weekly-plans";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/misc";
import { WeeklyPlanner } from "@/features/weekly-plans/weekly-planner";

export default async function WeeklyPlanPage({ searchParams }: PageProps<"/teacher/weekly-plan">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const classes = await listClasses(actor);
  if (classes.length === 0) return <EmptyState title={t("teacher.classes.empty")} />;
  const classId = typeof sp.classId === "string" && classes.some((c) => c.id === sp.classId) ? sp.classId : classes[0]!.id;
  const week = typeof sp.week === "string" && !Number.isNaN(Date.parse(sp.week)) ? startOfWeek(new Date(sp.week)) : startOfWeek(new Date());
  const view = await getWeeklyPlanView(actor, classId, week);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title={t("teacher.weekly.title")} description={t("teacher.weekly.subtitle")} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="border-line flex gap-1 rounded-xl border bg-white p-1">
          {classes.map((c) => (
            <Link
              key={c.id}
              href={`/teacher/weekly-plan?classId=${c.id}&week=${iso(week)}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${c.id === classId ? "bg-brand text-white" : "hover:bg-stone-100"}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/teacher/weekly-plan?classId=${classId}&week=${iso(addDays(week, -7))}`}
            aria-label={t("teacher.weekly.prev")}
            className="rounded-lg p-2 hover:bg-stone-100"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Link>
          <span className="text-sm font-medium">{t("teacher.weekly.week", { date: formatDate(week, locale) })}</span>
          <Link
            href={`/teacher/weekly-plan?classId=${classId}&week=${iso(addDays(week, 7))}`}
            aria-label={t("teacher.weekly.next")}
            className="rounded-lg p-2 hover:bg-stone-100"
          >
            <ChevronRight className="size-5 rtl:rotate-180" />
          </Link>
        </div>
      </div>
      <WeeklyPlanner
        classId={classId}
        weekStart={iso(week)}
        rows={view.children.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          avatarColor: c.avatarColor,
          goals: c.goals.map((g) => ({
            id: g.id,
            statement: g.statement,
            lastOutcome: g.lastOutcome?.result ?? null,
            items: g.items.map((i) => ({ id: i.id, dayOfWeek: i.dayOfWeek, contentType: i.contentType, title: i.title, status: i.status, content: i.content })),
          })),
        }))}
      />
    </div>
  );
}
