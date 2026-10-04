import Link from "next/link";
import { CalendarClock, FileText, Sparkles, Star, UserCheck, Eye } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, formatRelativeDays } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/translate";
import { teacherDashboard } from "@/server/services/dashboard";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";

export default async function TeacherDashboard() {
  const actor = await requirePageActor(["TEACHER"]);
  const { t, locale } = await getI18n();
  const d = await teacherDashboard(actor);
  const empty = (key: MessageKey) => <p className="text-muted py-2 text-sm">{t(key)}</p>;

  return (
    <div>
      <PageHeader
        title={t("teacher.dashboard.title", { name: actor.name.split(" ")[0]! })}
        description={t("teacher.dashboard.subtitle")}
        actions={
          <ButtonLink href="/teacher/weekly-plan" variant="outline">
            {t("teacher.dashboard.openPlanner")}
          </ButtonLink>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <UserCheck className="text-brand size-4" />
                {t("teacher.dashboard.needsReview")}
              </span>
            }
          />
          <CardBody className="space-y-1">
            {d.needsReview.length === 0 && empty("teacher.dashboard.needsReviewEmpty")}
            {d.needsReview.map((c) => (
              <Link
                key={c.id}
                href={c.pending ? `/teacher/children/${c.id}/profile` : `/teacher/children/${c.id}/parent`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-50"
              >
                <Avatar name={c.displayName} color={c.avatarColor} size="sm" />
                <span className="flex-1 font-medium">{c.displayName}</span>
                <span className="flex flex-wrap justify-end gap-1">
                  {c.pending > 0 && <Badge tone="amber">{t("teacher.dashboard.pendingItems", { n: c.pending })}</Badge>}
                  {c.messages > 0 && <Badge tone="sky">{t("teacher.dashboard.newMessage", { n: c.messages })}</Badge>}
                  {c.newQuestionnaire && <Badge tone="green">{t("teacher.dashboard.newQuestionnaire")}</Badge>}
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="text-brand size-4" />
                {t("teacher.dashboard.reviewDates")}
              </span>
            }
          />
          <CardBody className="space-y-1">
            {d.reviewGoals.length === 0 && empty("teacher.dashboard.reviewDatesEmpty")}
            {d.reviewGoals.map((g) => (
              <Link key={g.id} href={`/teacher/children/${g.child.id}/goals`} className="block rounded-xl px-2 py-2 hover:bg-stone-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{g.child.displayName}</span>
                  <Badge tone={g.overdue ? "amber" : "neutral"}>{g.overdue ? t("teacher.dashboard.overdue") : formatDate(g.reviewDate, locale)}</Badge>
                </div>
                <p className="text-muted mt-0.5 line-clamp-1 text-sm">{g.statement}</p>
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="text-brand size-4" />
                {t("teacher.dashboard.drafts")}
              </span>
            }
          />
          <CardBody className="space-y-1">
            {d.drafts.length === 0 && empty("teacher.dashboard.draftsEmpty")}
            {d.drafts.map((c) => (
              <Link key={c.id} href={`/teacher/content/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-50">
                <FileText className="text-muted size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="text-muted text-xs">
                    {c.child?.displayName} · {t(`enums.contentType.${c.type}`)}
                  </span>
                </span>
                {c.isDemoGenerated && <Badge tone="stone">{t("common.demo")}</Badge>}
                <Badge tone="amber">{t(`enums.contentStatus.${c.status}`)}</Badge>
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Eye className="text-brand size-4" />
                {t("teacher.dashboard.notObserved")}
              </span>
            }
          />
          <CardBody>
            {d.notObservedRecently.length === 0 && empty("teacher.dashboard.notObservedEmpty")}
            <div className="flex flex-wrap gap-2">
              {d.notObservedRecently.map((c) => (
                <Link
                  key={c.id}
                  href={`/teacher/children/${c.id}/observations/quick`}
                  className="border-line hover:border-brand flex items-center gap-2 rounded-full border bg-white py-1 ps-1 pe-3 text-sm"
                >
                  <Avatar name={c.displayName} color={c.avatarColor} size="sm" />
                  <span>
                    {c.displayName}
                    <span className="text-muted block text-[11px]">
                      {c.lastObservedAt
                        ? t("teacher.dashboard.lastObserved", { when: formatRelativeDays(c.lastObservedAt, locale) })
                        : t("teacher.dashboard.never")}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="text-brand size-4" />
                {t("teacher.dashboard.plannedThisWeek")}
              </span>
            }
          />
          <CardBody className="space-y-1">
            {d.planItems.length === 0 && empty("teacher.dashboard.plannedEmpty")}
            {d.planItems.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
                <span className="text-muted w-24 shrink-0">{t(`enums.days.${i.dayOfWeek}` as MessageKey)}</span>
                <span className="flex-1">
                  {i.child.displayName} · {t(`enums.planItem.${i.title}` as MessageKey)}
                </span>
                <Badge tone={i.status === "DONE" ? "green" : i.status === "READY" ? "sky" : "neutral"}>{t(`enums.planStatus.${i.status}`)}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Star className="text-brand size-4" />
                {t("teacher.dashboard.improved")}
              </span>
            }
          />
          <CardBody className="space-y-1">
            {d.improvements.length === 0 && empty("teacher.dashboard.improvedEmpty")}
            {d.improvements.map((o) => (
              <Link key={o.id} href={`/teacher/children/${o.child.id}/progress`} className="block rounded-xl px-2 py-2 hover:bg-stone-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{o.child.displayName}</span>
                  <Badge tone="green">{t("enums.outcome.HELPED")}</Badge>
                </div>
                <p className="text-muted mt-0.5 line-clamp-1 text-sm">{o.goal.statement}</p>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
