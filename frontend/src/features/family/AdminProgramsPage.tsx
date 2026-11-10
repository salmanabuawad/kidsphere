/**
 * /admin/family-programs: admins create and edit the weekly family journeys (e.g. "Roots of
 * Resilience"), one language and one week at a time, and publish, unpublish or archive them.
 * Texts get the same wording check as everything parents read (422 shows the issues).
 */
import { useState } from "react";
import { Plus, Sprout, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, Input, PageHeader, PageSkeleton, Select, Textarea, ToggleChip } from "@/components/ui";
import { LOCALE_NAMES, LOCALES, pick, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";
import { createProgram, programsUrl, updateProgram, type Lang, type Program, type ProgramStatus, type ProgramWeek, type WeekType } from "./api";

const WEEK_TYPES: WeekType[] = ["home_activity", "story", "digital_game", "real_world_activity", "video"];
const STATUS_TONE: Record<ProgramStatus, "success" | "muted" | "neutral"> = { published: "success", draft: "muted", archived: "neutral" };
const blankWeek = (): ProgramWeek => ({ content_type: "home_activity", topic: {}, lesson: {}, try_at_home: {}, reflection: {} });

export function AdminProgramsPage() {
  const { t, locale } = useI18n();
  const { data, loading, reload } = useFetch<{ programs: Program[] }>(programsUrl);
  const [editing, setEditing] = useState<Program | "new" | null>(null);
  const { run, pending } = useAction();
  const programs = data?.programs ?? [];

  if (editing)
    return (
      <ProgramEditor
        program={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          reload();
        }}
      />
    );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={<Sprout />}
        title={t("family.admin.title")}
        description={t("family.admin.subtitle")}
        actions={
          <Button icon={<Plus aria-hidden />} onClick={() => setEditing("new")}>
            {t("family.admin.new")}
          </Button>
        }
      />
      {loading && !data ? (
        <PageSkeleton />
      ) : programs.length === 0 ? (
        <EmptyState title={t("family.admin.empty")} />
      ) : (
        <ul className="space-y-3" data-testid="program-list">
          {programs.map((p) => (
            <li key={p.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink" dir="auto">
                      {pick(p.title, locale)}
                    </p>
                    <p className="text-sm text-ink-muted">{t("family.admin.weeks", { count: p.weeks.length })}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[p.status]}>{t(`family.admin.status.${p.status}`)}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      {t("common.edit")}
                    </Button>
                    {p.status !== "published" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={async () => (await run(() => updateProgram(p.id, { status: "published" }))).ok && reload()}>
                        {t("family.admin.publish")}
                      </Button>
                    )}
                    {p.status === "published" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={async () => (await run(() => updateProgram(p.id, { status: "draft" }))).ok && reload()}>
                        {t("family.admin.unpublish")}
                      </Button>
                    )}
                    {p.status !== "archived" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={async () => (await run(() => updateProgram(p.id, { status: "archived" }))).ok && reload()}>
                        {t("family.admin.archive")}
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LangInput({ value, lang, onChange, multiline, max, label }: { value: Lang; lang: AppLocale; onChange: (v: Lang) => void; multiline?: boolean; max: number; label: string }) {
  const v = value[lang] ?? "";
  const set = (s: string) => onChange({ ...value, [lang]: s });
  return (
    <Field label={label}>
      {(p) =>
        multiline ? (
          <Textarea {...p} lang={lang} dir="auto" rows={3} maxLength={max} value={v} onChange={(e) => set(e.target.value)} />
        ) : (
          <Input {...p} lang={lang} dir="auto" maxLength={max} value={v} onChange={(e) => set(e.target.value)} />
        )
      }
    </Field>
  );
}

function ProgramEditor({ program, onDone }: { program: Program | null; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { run, pending } = useAction();
  const [lang, setLang] = useState<AppLocale>(locale);
  const [title, setTitle] = useState<Lang>(program?.title ?? {});
  const [description, setDescription] = useState<Lang>(program?.description ?? {});
  const [weeks, setWeeks] = useState<ProgramWeek[]>(program?.weeks.length ? program.weeks : [blankWeek()]);
  const [n, setN] = useState(0);
  const [issues, setIssues] = useState<string[] | null>(null);
  const week = weeks[Math.min(n, weeks.length - 1)]!;
  const setWeek = (w: ProgramWeek) => setWeeks((ws) => ws.map((x, i) => (i === n ? w : x)));

  async function save() {
    setIssues(null);
    const body = { title, description, weeks, status: program?.status ?? ("draft" as const) };
    const r = await run(() => (program ? updateProgram(program.id, body) : createProgram(body)), {
      success: t("family.admin.saved"),
      errorToast: false,
      onError: (e) => setIssues(isApiError(e, "UNSAFE_CONTENT") ? (((e.details as { issues?: string[] })?.issues ?? []) as string[]) : [t("family.admin.incomplete")]),
    });
    if (r.ok) onDone();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-testid="program-editor">
      <PageHeader icon={<Sprout />} title={program ? pick(program.title, locale) : t("family.admin.new")} back={{ to: paths.adminFamilyPrograms(), label: t("family.admin.title") }} />
      <div role="radiogroup" aria-label={t("family.admin.language")} className="flex flex-wrap gap-2">
        {LOCALES.map((l) => (
          <ToggleChip key={l} single selected={lang === l} onToggle={() => setLang(l)}>
            {LOCALE_NAMES[l]}
          </ToggleChip>
        ))}
      </div>
      <Card>
        <CardBody className="space-y-4">
          <LangInput label={t("family.admin.programTitle")} value={title} lang={lang} onChange={setTitle} max={120} />
          <LangInput label={t("family.admin.description")} value={description} lang={lang} onChange={setDescription} max={600} multiline />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("family.admin.weekTitle")} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {weeks.map((_, i) => (
              <ToggleChip key={i} single selected={i === n} onToggle={() => setN(i)}>
                {t("family.weekN", { n: i + 1 })}
              </ToggleChip>
            ))}
            {weeks.length < 12 && (
              <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => { setWeeks((ws) => [...ws, blankWeek()]); setN(weeks.length); }}>
                {t("family.admin.addWeek")}
              </Button>
            )}
          </div>
          <Field label={t("family.admin.weekType")}>
            {(p) => (
              <Select {...p} value={week.content_type} onChange={(e) => setWeek({ ...week, content_type: e.target.value as WeekType })}>
                {WEEK_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(`content.types.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <LangInput label={t("family.admin.topic")} value={week.topic} lang={lang} onChange={(v) => setWeek({ ...week, topic: v })} max={120} />
          <LangInput label={t("family.admin.lesson")} value={week.lesson} lang={lang} onChange={(v) => setWeek({ ...week, lesson: v })} max={1200} multiline />
          <LangInput label={t("family.tryAtHome")} value={week.try_at_home} lang={lang} onChange={(v) => setWeek({ ...week, try_at_home: v })} max={600} multiline />
          <LangInput label={t("family.admin.reflection")} value={week.reflection} lang={lang} onChange={(v) => setWeek({ ...week, reflection: v })} max={200} />
          {weeks.length > 1 && (
            <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden />} onClick={() => { setWeeks((ws) => ws.filter((_, i) => i !== n)); setN(0); }}>
              {t("family.admin.removeWeek")}
            </Button>
          )}
        </CardBody>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={pending}>
            {t("common.save")}
          </Button>
        </CardFooter>
      </Card>
      {issues && (
        <Alert tone="warning" title={t("family.admin.notSaved")}>
          <ul className="list-disc ps-5">
            {issues.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
