import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Search, Zap } from "lucide-react";
import { Alert, Button, ButtonLink, EmptyState, Input, PageHeader, PageSkeleton, Skeleton } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { ChildAvatar, childUrl, displayName, isStaffView, type ChildCard, type ChildDetail, type ChildListResponse } from "@/features/children";
import { isLookFor, recentChildIds, type LookFor } from "./api";
import { QuickObservationForm } from "./QuickObservationForm";

/**
 * /children/:id/observe — a compact header (no tabs, so the form starts high
 * on a phone) and the quick observation form. Save → back to the profile.
 */
export function ChildObservePage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const raw = (location.state as { lookFor?: unknown } | null)?.lookFor;
  const lookFor: LookFor | null = isLookFor(raw) ? raw : null;
  const toMessage = useErrorMessage();
  const { data, error, reload } = useFetch<{ child: ChildDetail }>(childUrl(id));
  const child = data?.child;

  if (!child) {
    if (error)
      return (
        <Alert
          tone="error"
          action={
            error.status === 404 ? (
              <ButtonLink size="sm" variant="outline" to={paths.observe()}>
                {t("observations.picker.title")}
              </ButtonLink>
            ) : (
              <Button size="sm" variant="outline" onClick={reload}>
                {t("common.retry")}
              </Button>
            )
          }
        >
          {toMessage(error)}
        </Alert>
      );
    return <PageSkeleton />;
  }

  const name = displayName(child);
  const focus = isStaffView(child) ? child.focus_areas : [];
  return (
    <div className="mx-auto max-w-2xl">
      <Link to={paths.child(child.id)} className="-ms-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("observations.back")}
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <ChildAvatar child={child} size="lg" />
        <div className="min-w-0">
          <p className="text-sm text-muted">{t("observations.title")}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink" dir="auto">
            {name}
          </h1>
        </div>
      </div>
      <p className="mb-5 text-sm text-muted">{t("observations.intro")}</p>
      <QuickObservationForm childId={child.id} focusAreas={focus} lookFor={lookFor} onSaved={() => navigate(paths.child(child.id), { state: { saved: true } })} />
    </div>
  );
}

/** /observe — pick a child fast (search + recently observed on this device), then the same form. */
export function ObservePickerPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<ChildListResponse>("/api/children");
  const [q, setQ] = useState("");
  const children = useMemo(() => data?.children ?? [], [data]);
  const recent = useMemo(() => {
    const byId = new Map(children.map((c) => [c.id, c]));
    return recentChildIds()
      .map((cid) => byId.get(cid))
      .filter((c): c is ChildCard => !!c);
  }, [children]);
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle
    ? children.filter((c) => `${c.name} ${c.preferred_name ?? ""}`.toLocaleLowerCase().includes(needle))
    : children;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("observations.picker.title")} icon={<Zap aria-hidden />} />
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          type="search"
          dir="auto"
          className="h-12 ps-11 text-base"
          aria-label={t("observations.picker.search")}
          placeholder={t("observations.picker.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              {t("common.retry")}
            </Button>
          }
        >
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : children.length === 0 ? (
        <EmptyState icon={<Zap aria-hidden />} title={t("observations.picker.noChildren")} />
      ) : (
        <div className="space-y-6">
          {!needle && recent.length > 0 && (
            <section aria-labelledby="observe-recent">
              <h2 id="observe-recent" className="mb-2 text-sm font-semibold text-muted">
                {t("observations.picker.recent")}
              </h2>
              <ChildRows items={recent} />
            </section>
          )}
          <section aria-labelledby="observe-all">
            <h2 id="observe-all" className="mb-2 text-sm font-semibold text-muted">
              {t("observations.picker.all")}
            </h2>
            {shown.length === 0 ? <p className="text-sm text-muted">{t("observations.picker.empty")}</p> : <ChildRows items={shown} />}
          </section>
        </div>
      )}
    </div>
  );
}

function ChildRows({ items }: { items: ChildCard[] }) {
  const { t } = useI18n();
  const { formatRelativeDays } = useFormat();
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            to={paths.childObserve(c.id)}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2 transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            <ChildAvatar child={c} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-ink" dir="auto">
                {displayName(c)}
              </span>
              <span className="block truncate text-sm text-muted">
                {c.class ? <span dir="auto">{c.class.name} · </span> : null}
                {c.last_observation_at
                  ? t("observations.picker.lastObserved", { when: formatRelativeDays(c.last_observation_at) })
                  : t("observations.picker.never")}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
