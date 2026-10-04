import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listLibrary } from "@/server/services/content";
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE } from "@/features/content/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export default async function ChildContentPage({ params }: PageProps<"/teacher/children/[childId]/content">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const { items } = await listLibrary(actor, { childId });
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ButtonLink href={`/teacher/studio?childId=${childId}`}>
          <Sparkles className="size-4" />
          {t("teacher.child.generate")}
        </ButtonLink>
      </div>
      {items.length === 0 && <EmptyState title={t("teacher.library.empty")} />}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((c) => (
          <Link key={c.id} href={`/teacher/content/${c.id}`}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[c.status]}>{t(`enums.contentStatus.${c.status}`)}</Badge>
                <Badge>{t(`enums.contentType.${c.type}`)}</Badge>
                <Badge tone="stone">{LOCALE_NAMES[c.language]}</Badge>
                {c.isDemoGenerated && <Badge tone="stone">{t("common.demo")}</Badge>}
              </div>
              <p className="mt-2 font-medium" dir="auto">
                {c.title}
              </p>
              <p className="text-muted mt-1 line-clamp-1 text-sm">{c.goal?.statement}</p>
              <p className="text-muted mt-2 text-xs">{formatDate(c.updatedAt, locale)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
