/**
 * /sessions — the class sessions of the user's classes, newest first, and "New session".
 * /sessions/:id — who took part and, for each child, how it went: a support level (the quick
 * observation scale) and an optional short note. Saving turns each note into an observation
 * on the child's timeline, linked to a matching Current Focus.
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronRight, LibraryBig, Plus, Save, Users } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, EmptyState, PageHeader, PageSkeleton, Skeleton, Textarea } from "@/components/ui";
import { ChildAvatar, displayName } from "@/features/children";
import { QUICK_SUPPORT, SupportScale } from "@/features/observations";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { saveSessionNotes, sessionsUrl, sessionUrl, type ClassSession, type SessionChild, type SessionNote, type SessionResponse } from "./api";
import { StartSessionDialog } from "./StartSessionDialog";

export function SessionsPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { formatDate } = useFormat();
  const { data, error, loading, reload } = useFetch<{ sessions: ClassSession[] }>(sessionsUrl);
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={<Users />}
        title={t("sessions.title")}
        description={t("sessions.intro")}
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
            {t("sessions.new")}
          </Button>
        }
      />
      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data || data.sessions.length === 0 ? (
        <EmptyState scene="search" title={t("sessions.empty")} />
      ) : (
        <ul className="space-y-3">
          {data.sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={paths.session(s.id)}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-lip focus-visible:outline-offset-4"
                data-testid="session-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-ink" dir="auto">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    {formatDate(s.held_on)} · <span dir="auto">{s.class.name}</span> · {t("sessions.noted", { noted: s.noted_count, total: s.children_count })}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-muted rtl:-scale-x-100" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && <StartSessionDialog open onClose={() => setOpen(false)} />}
    </div>
  );
}

type Draft = Record<string, { support_level: string | null; observation: string }>;

function draftOf(children: SessionChild[]): Draft {
  return Object.fromEntries(
    children.map((c) => [c.id, { support_level: c.observation?.support_level ?? null, observation: c.observation?.observation ?? "" }]),
  );
}

export function SessionPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<SessionResponse>(sessionUrl(id));
  const session = data?.session;
  if (!session) {
    if (error)
      return error.status === 404 ? (
        <EmptyState scene="search" title={t("sessions.notFound")} />
      ) : (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      );
    return loading ? <PageSkeleton /> : null;
  }
  return <Notes key={session.id} session={session} onSaved={(s) => setData({ session: s })} />;
}

function Notes({ session, onSaved }: { session: ClassSession; onSaved: (s: ClassSession) => void }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { pending, run } = useAction();
  const children = session.children ?? [];
  const [draft, setDraft] = useState<Draft>(() => draftOf(children));
  const set = (childId: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [childId]: { ...d[childId]!, ...patch } }));
  const changed: SessionNote[] = children
    .filter((c) => {
      const d = draft[c.id]!;
      return d.support_level !== (c.observation?.support_level ?? null) || d.observation.trim() !== (c.observation?.observation ?? "");
    })
    .map((c) => ({ child_id: c.id, support_level: draft[c.id]!.support_level, observation: draft[c.id]!.observation.trim() || null }));
  const save = () =>
    run(() => saveSessionNotes(session.id, changed), {
      success: t("sessions.saved"),
      onSuccess: (r) => {
        setDraft(draftOf(r.session.children ?? []));
        onSaved(r.session);
      },
    });
  const options = QUICK_SUPPORT.map((level) => ({ key: level, label: t(`observations.supportLevels.${level}`) }));
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <PageHeader
        back={{ to: paths.sessions(), label: t("sessions.title") }}
        icon={<Users />}
        eyebrow={
          <span>
            {formatDate(session.held_on)} · <span dir="auto">{session.class.name}</span>
          </span>
        }
        title={<span dir="auto">{session.title}</span>}
        actions={
          session.library_item ? (
            <Link
              to={paths.libraryItem(session.library_item.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand hover:underline"
            >
              <LibraryBig className="size-4" aria-hidden />
              {t("sessions.openItem")}
            </Link>
          ) : undefined
        }
      />
      <Alert tone="tip">{t("sessions.notesHint")}</Alert>
      <ul className="space-y-3">
        {children.map((c) => {
          const d = draft[c.id]!;
          return (
            <li key={c.id}>
              <Card data-testid="session-child">
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <ChildAvatar child={c} size="sm" />
                    <span className="font-semibold text-ink" dir="auto">
                      {displayName(c)}
                    </span>
                    {c.observation?.focus_area_title && <Badge tone="focus">{t("timeline.focusLink", { title: c.observation.focus_area_title })}</Badge>}
                    {c.observation && <Badge tone="success">{t("sessions.savedBadge")}</Badge>}
                  </div>
                  <SupportScale
                    options={options}
                    value={d.support_level}
                    onChange={(v) => set(c.id, { support_level: v })}
                    label={t("sessions.howItWent", { name: displayName(c) })}
                  />
                  <Textarea
                    dir="auto"
                    rows={2}
                    maxLength={4000}
                    value={d.observation}
                    placeholder={t("sessions.notePlaceholder")}
                    aria-label={t("sessions.noteLabel", { name: displayName(c) })}
                    onChange={(e) => set(c.id, { observation: e.target.value })}
                  />
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-line bg-ground px-1 py-3">
        <Button size="lg" onClick={() => void save()} loading={pending} disabled={changed.length === 0} icon={<Save className="size-4" aria-hidden />}>
          {t("sessions.save", { count: changed.length })}
        </Button>
      </div>
    </div>
  );
}
