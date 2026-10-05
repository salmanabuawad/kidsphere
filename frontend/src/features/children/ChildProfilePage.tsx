import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, ClipboardCheck, Lightbulb, LineChart, MessageSquareQuote, PencilLine, Plus, Sparkles, Target, Zap } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, PageSkeleton } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { childUrl, displayName, isStaffView, WIZARD_REVIEW_STEP } from "./api";
import { ChildLayout } from "./ChildLayout";
import { ProfileItemChips } from "./ProfileItems";
import type { ChildDetail, ChildStaffView, FocusAreaSummary, FocusPlan, ProfileItem } from "./types";

const PLAN_STEPS: (keyof FocusPlan)[] = ["strength_used", "need", "adaptation", "what_we_will_do", "success_looks_like"];
const MAX_FOCUS = 3;

/** /children/:id — who this child is, at a glance (spec §13). */
export function ChildProfilePage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
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
              <ButtonLink size="sm" variant="outline" to={paths.children()}>
                {t("children.child.backToList")}
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

  return (
    <ChildLayout childId={id} child={child} onChanged={reload}>
      {isStaffView(child) ? <StaffProfile child={child} /> : <BasicProfile strengths={child.strengths} interests={child.interests} />}
    </ChildLayout>
  );
}

function StaffProfile({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  const name = displayName(child);
  const wizardDone = !!child.wizard.completed_at;
  const summary = typeof child.current_understanding?.summary === "string" ? child.current_understanding.summary : null;

  return (
    <div className="space-y-5">
      {!wizardDone ? (
        <Alert
          tone="tip"
          title={t("children.profile.continueTitle")}
          action={
            <ButtonLink to={paths.childEdit(child.id, child.wizard.step || 1)} icon={<PencilLine className="size-4" aria-hidden />}>
              {t("children.profile.continueAction")}
            </ButtonLink>
          }
        >
          {t("children.profile.continueBody", { name })}
        </Alert>
      ) : (
        !child.baseline.exists && (
          <Alert
            tone="info"
            title={t("children.profile.baselineTitle")}
            action={
              <ButtonLink to={paths.childEdit(child.id, WIZARD_REVIEW_STEP)} variant="outline" icon={<ClipboardCheck className="size-4" aria-hidden />}>
                {t("children.profile.baselineAction")}
              </ButtonLink>
            }
          >
            {t("children.profile.baselineBody", { name })}
          </Alert>
        )
      )}

      <ActionBar childId={child.id} />

      <Section
        title={t("children.profile.strengths")}
        emoji="⭐"
        tone="strength"
        empty={t("children.profile.strengthsEmpty")}
        list="strengths"
        items={child.strengths}
        fallbackIcon="⭐"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t("children.profile.interests")}
          emoji="💡"
          tone="interest"
          empty={t("children.profile.interestsEmpty")}
          list="interests"
          items={child.interests}
        />
        <Section
          title={t("children.profile.whatHelps")}
          emoji="✓"
          tone="helps"
          empty={t("children.profile.whatHelpsEmpty")}
          list="what_helps"
          items={child.what_helps}
          fallbackIcon="✓"
        />
      </div>

      <FocusCard child={child} />

      <RecentCard child={child} />

      {summary && (
        <Card>
          <CardHeader title={t("children.profile.understanding")} icon={<Lightbulb className="size-4" aria-hidden />} />
          <CardBody>
            <p className="leading-relaxed text-ink" dir="auto">
              {summary}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** What a non-staff viewer may see: strengths and interests only. */
function BasicProfile({ strengths, interests }: { strengths: ProfileItem[]; interests: ProfileItem[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <Section title={t("children.profile.strengths")} emoji="⭐" tone="strength" empty={t("children.profile.strengthsEmpty")} list="strengths" items={strengths} fallbackIcon="⭐" />
      <Section title={t("children.profile.interests")} emoji="💡" tone="interest" empty={t("children.profile.interestsEmpty")} list="interests" items={interests} />
    </div>
  );
}

/** The four obvious actions of spec §13, big enough for a tablet thumb. */
function ActionBar({ childId }: { childId: string }) {
  const { t } = useI18n();
  const items: { to: string; label: string; icon: ReactNode; primary?: boolean }[] = [
    { to: paths.childObserve(childId), label: t("children.profile.actions.observe"), icon: <Zap className="size-5" aria-hidden />, primary: true },
    { to: paths.newContent(childId), label: t("children.profile.actions.content"), icon: <Sparkles className="size-5" aria-hidden /> },
    { to: paths.childDevelopment(childId), label: t("children.profile.actions.development"), icon: <LineChart className="size-5" aria-hidden /> },
    { to: paths.childEdit(childId, 1), label: t("children.profile.actions.edit"), icon: <PencilLine className="size-5" aria-hidden /> },
  ];
  return (
    <nav aria-label={t("children.profile.actions.label")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => (
        <ButtonLink key={i.to} to={i.to} size="lg" variant={i.primary ? "primary" : "outline"} icon={i.icon} className="h-14 w-full whitespace-normal text-center leading-tight">
          {i.label}
        </ButtonLink>
      ))}
    </nav>
  );
}

const SECTION_TONES = {
  strength: "border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white",
  interest: "border-sky-200 bg-gradient-to-b from-sky-50/70 to-white",
  helps: "border-violet-200 bg-gradient-to-b from-violet-50/70 to-white",
} as const;

const TITLE_TONES = { strength: "text-emerald-900", interest: "text-sky-900", helps: "text-violet-900" } as const;

function Section({
  title,
  emoji,
  tone,
  empty,
  list,
  items,
  fallbackIcon,
}: {
  title: string;
  emoji: string;
  tone: keyof typeof SECTION_TONES;
  empty: string;
  list: string;
  items: ProfileItem[];
  fallbackIcon?: string;
}) {
  const id = `section-${list}`;
  return (
    <section aria-labelledby={id} className={cn("rounded-[var(--radius-card)] border p-4 sm:p-5", SECTION_TONES[tone])} data-testid={id}>
      <h2 id={id} className={cn("mb-3 flex items-center gap-2 text-lg font-semibold", TITLE_TONES[tone])}>
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ProfileItemChips list={list} items={items} tone={tone} fallbackIcon={fallbackIcon} />}
    </section>
  );
}

function FocusCard({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  const focus = child.focus_areas.slice(0, MAX_FOCUS);
  return (
    <Card>
      <CardHeader
        title={t("children.profile.focus")}
        icon={<Target className="size-4" aria-hidden />}
        action={
          <ButtonLink to={paths.childFocus(child.id)} size="sm" variant="soft" icon={focus.length < MAX_FOCUS ? <Plus className="size-4" aria-hidden /> : undefined}>
            {t("children.profile.manageFocus")}
          </ButtonLink>
        }
      />
      <CardBody>
        {focus.length === 0 ? (
          <p className="text-sm text-muted">{t("children.profile.focusEmpty")}</p>
        ) : (
          <ol className="space-y-3" data-testid="focus-list">
            {focus.map((f, i) => (
              <FocusRow key={f.id} childId={child.id} focus={f} n={i + 1} />
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function FocusRow({ childId, focus, n }: { childId: string; focus: FocusAreaSummary; n: number }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const [open, setOpen] = useState(false);
  const steps = PLAN_STEPS.filter((k) => typeof focus.plan?.[k] === "string" && focus.plan[k]!.trim());
  return (
    <li className="rounded-xl border border-line bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-semibold text-amber-900" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink" dir="auto">
            {focus.title}
          </p>
          <p className="text-sm text-muted">{optionLabel("priority_categories", focus.category)}</p>
          {focus.description && (
            <p className="mt-1 text-sm text-ink/80" dir="auto">
              {focus.description}
            </p>
          )}
        </div>
        <ButtonLink
          to={paths.newContent(childId, { mode: "growth_support", focus: focus.id })}
          size="sm"
          variant="outline"
          icon={<Sparkles className="size-4" aria-hidden />}
        >
          {t("children.profile.focusCreate")}
        </ButtonLink>
      </div>
      {steps.length > 0 && (
        <div className="mt-2 ps-12">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? t("children.profile.hidePlan") : t("children.profile.showPlan")}
          </button>
          {open && (
            <ol className="mt-1 space-y-2">
              {steps.map((k, i) => (
                <li key={k} className="flex gap-2 text-sm">
                  {i > 0 && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />}
                  {i === 0 && <span className="size-4 shrink-0" aria-hidden />}
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{t(`children.profile.plan.${k}`)}: </span>
                    <span dir="auto" className="text-ink/80">
                      {focus.plan![k]}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

function RecentCard({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { item, labelOf } = useOptions();
  const latest = child.latest_observation;
  const support = latest?.support_level ? item("support_levels", latest.support_level) : undefined;
  return (
    <Card>
      <CardHeader
        title={t("children.profile.recent")}
        icon={<MessageSquareQuote className="size-4" aria-hidden />}
        action={
          <ButtonLink to={paths.childObserve(child.id)} size="sm" variant="soft" icon={<Zap className="size-4" aria-hidden />}>
            {t("children.profile.actions.observe")}
          </ButtonLink>
        }
      />
      <CardBody>
        {!latest ? (
          <p className="text-sm text-muted">{t("children.profile.recentEmpty")}</p>
        ) : (
          <figure>
            <blockquote className="border-s-4 border-brand/40 ps-4 text-lg leading-relaxed text-ink" dir="auto">
              {latest.observation}
            </blockquote>
            <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{t("children.profile.lastObserved", { date: formatDate(latest.observed_at) })}</span>
              {support && <span>{support.icon ? `${support.icon} ` : ""}{labelOf(support)}</span>}
            </figcaption>
          </figure>
        )}
        <Link to={paths.childTimeline(child.id)} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
          {t("children.profile.timelineLink")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </CardBody>
    </Card>
  );
}
