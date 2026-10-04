import Link from "next/link";
import type { ContentStatus, ContentType, DevelopmentDomain, Locale } from "@prisma/client";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { db } from "@/lib/db";
import { childScopeWhere } from "@/lib/permissions";
import { listClasses } from "@/server/services/children";
import { listLibrary } from "@/server/services/content";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader, SectionTitle } from "@/components/ui/misc";
import { STATUS_TONE } from "@/features/content/status";
import { LibraryFilters } from "@/features/content/library-filters";
import { UseTemplateButton } from "@/features/content/use-template";
import { CONTENT_TYPE_VALUES, DOMAIN_VALUES } from "@/server/validators";

const STATUSES: ContentStatus[] = ["DRAFT", "TEACHER_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"];

export default async function LibraryPage({ searchParams }: PageProps<"/teacher/library">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  const filters = {
    language: pick<Locale>(sp.language, ["ar", "he", "en"]),
    type: pick<ContentType>(sp.type, CONTENT_TYPE_VALUES),
    status: pick<ContentStatus>(sp.status, STATUSES),
    domain: pick<DevelopmentDomain>(sp.domain, DOMAIN_VALUES),
    classId: typeof sp.classId === "string" && sp.classId ? sp.classId : undefined,
    goalId: typeof sp.goalId === "string" && sp.goalId ? sp.goalId : undefined,
    ageBand: typeof sp.ageBand === "string" && sp.ageBand ? sp.ageBand : undefined,
    createdById: sp.mine === "1" ? actor.userId : undefined,
  };
  const [{ items, templates }, classes, children] = await Promise.all([
    listLibrary(actor, filters),
    listClasses(actor),
    db.child.findMany({
      where: { AND: [{ archivedAt: null }, childScopeWhere(actor)] },
      select: { id: true, displayName: true, goals: { where: { status: "ACTIVE" }, select: { id: true, statement: true } } },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("teacher.library.title")} description={t("teacher.library.subtitle")} />
      <LibraryFilters classes={classes.map((c) => ({ id: c.id, name: c.name }))} statuses={STATUSES} />

      <section>
        {items.length === 0 ? (
          <EmptyState title={t("teacher.library.empty")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <Link key={c.id} href={`/teacher/content/${c.id}`}>
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS_TONE[c.status]}>{t(`enums.contentStatus.${c.status}`)}</Badge>
                    <Badge>{t(`enums.contentType.${c.type}`)}</Badge>
                    <Badge tone="stone">{LOCALE_NAMES[c.language]}</Badge>
                    <Badge tone="stone">{c.ageBand}</Badge>
                  </div>
                  <p className="mt-2 font-medium" dir="auto">
                    {c.title}
                  </p>
                  <p className="text-muted mt-1 text-sm">{c.child?.displayName}</p>
                  <p className="text-muted mt-2 text-xs">{formatDate(c.updatedAt, locale)}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>{t("teacher.library.templates")}</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col p-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="violet">{t(`enums.contentType.${tpl.type}`)}</Badge>
                <Badge tone="stone">{LOCALE_NAMES[tpl.language]}</Badge>
              </div>
              <p className="mt-2 font-medium" dir="auto">
                {tpl.title}
              </p>
              {tpl.description && <p className="text-muted mt-1 text-sm">{tpl.description}</p>}
              <div className="mt-auto pt-3">
                <UseTemplateButton templateId={tpl.id} childOptions={children} />
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
