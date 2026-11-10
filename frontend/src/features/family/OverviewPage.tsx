/**
 * /family/overview (staff): how the family journeys are going, as plain counts only: journeys,
 * families who shared each week, activity around the content, and what parents answered at the
 * start and the end. Never per child, never percentages or rankings. Admins see every
 * kindergarten; teachers their own classes.
 */
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Alert, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, PageSkeleton, Select, Table } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFetch } from "@/lib/useFetch";
import type { Lang } from "./api";

type Overview = {
  programs: { id: string; title: Lang }[];
  journeys: { total: number; by_status: Record<string, number>; by_kindergarten: { kindergarten: string; count: number }[] };
  weekly_reflections: { week: number; families: number }[];
  families_active_recently: number;
  recent_days: number;
  content: { home_reflections: number; shared: number; awaiting_approval: number };
  questionnaires: { baseline: number; end: number; answers: Record<"baseline" | "end", Record<string, Record<string, number>>> };
};
type Question = { key: string; text: string; options: { key: string; label: string }[] };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-tray p-3">
      <p className="tabular font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

export function OverviewPage() {
  const { t, locale } = useI18n();
  const [programId, setProgramId] = useState("");
  const { data, loading } = useFetch<Overview>(`/api/family-overview${programId ? `?program_id=${encodeURIComponent(programId)}` : ""}`);
  const questions = useFetch<{ questions: Question[] }>(`/api/family-questionnaire?language=${locale}`).data?.questions ?? [];

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <EmptyState title={t("family.overview.empty")} />;
  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="family-overview">
      <PageHeader icon={<BarChart3 />} title={t("family.overview.title")} description={t("family.overview.subtitle")} />
      <Field label={t("family.program")} className="max-w-sm">
        {(p) => (
          <Select {...p} value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">{t("family.overview.allPrograms")}</option>
            {data.programs.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pick(pr.title, locale)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("family.overview.journeys")} value={data.journeys.total} />
        <Stat label={t("family.overview.active")} value={data.journeys.by_status.active ?? 0} />
        <Stat label={t("family.overview.completed")} value={data.journeys.by_status.completed ?? 0} />
        <Stat label={t("family.overview.recent", { days: data.recent_days })} value={data.families_active_recently} />
        <Stat label={t("family.overview.homeReflections")} value={data.content.home_reflections} />
        <Stat label={t("family.overview.shared")} value={data.content.shared} />
        <Stat label={t("family.overview.awaiting")} value={data.content.awaiting_approval} />
        <Stat label={t("family.overview.questionnaires")} value={data.questionnaires.baseline + data.questionnaires.end} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("family.overview.byKindergarten")} />
          <CardBody>
            <Table>
              <tbody>
                {data.journeys.by_kindergarten.map((k) => (
                  <tr key={k.kindergarten}>
                    <td dir="auto">{k.kindergarten}</td>
                    <td className="tabular text-end">{k.count}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("family.overview.weekly")} />
          <CardBody>
            <Table>
              <tbody>
                {data.weekly_reflections.map((w) => (
                  <tr key={w.week}>
                    <td>{t("family.weekN", { n: w.week })}</td>
                    <td className="tabular text-end">{t("family.overview.families", { count: w.families })}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title={t("family.overview.answers")} description={t("family.overview.answersHint", { start: data.questionnaires.baseline, end: data.questionnaires.end })} />
        <CardBody className="space-y-4">
          {questions.map((q) => (
            <div key={q.key}>
              <p className="text-sm font-semibold text-ink">{q.text}</p>
              <Table>
                <thead>
                  <tr>
                    <th className="text-start"> </th>
                    <th className="text-end">{t("family.overview.atStart")}</th>
                    <th className="text-end">{t("family.overview.atEnd")}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.options.map((o) => (
                    <tr key={o.key}>
                      <td>{o.label}</td>
                      <td className="tabular text-end">{data.questionnaires.answers.baseline[q.key]?.[o.key] ?? 0}</td>
                      <td className="tabular text-end">{data.questionnaires.answers.end[q.key]?.[o.key] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </CardBody>
      </Card>
      <Alert tone="info">{t("family.overview.disclaimer")}</Alert>
    </div>
  );
}
