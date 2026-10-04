import Link from "next/link";
import { School } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { listClasses } from "@/server/services/children";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export default async function ClassesPage() {
  const actor = await requirePageActor(["TEACHER"]);
  const { t } = await getI18n();
  const classes = await listClasses(actor);
  return (
    <div>
      <PageHeader title={t("teacher.classes.title")} />
      {classes.length === 0 ? (
        <EmptyState icon={<School />} title={t("teacher.classes.empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`}>
              <Card className="h-full p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="bg-brand/10 flex size-11 items-center justify-center rounded-2xl text-xl">🌻</div>
                  <Badge>{c.ageBand}</Badge>
                </div>
                <h2 className="mt-4 text-lg font-semibold">{c.name}</h2>
                <p className="text-muted text-sm">{c.kindergarten.name}</p>
                <p className="mt-3 text-sm">{t("teacher.classes.children", { n: c._count.children })}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
