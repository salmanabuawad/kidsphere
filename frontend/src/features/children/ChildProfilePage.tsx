import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, ClipboardCheck, Lightbulb, Pencil, PencilLine, Plus } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, NumeralBlock, PageSkeleton } from "@/components/ui";
import {
  AttentionIcon,
  ContentIcon,
  CurrentFocusIcon,
  DevelopmentIcon,
  InterestsIcon,
  NoteQuoteIcon,
  ObserveAddIcon,
  StrengthsIcon,
  WhatHelpsIcon,
  type KidIcon,
} from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { childUrl, displayName, isStaffView, WIZARD_REVIEW_STEP } from "./api";
import { ChildLayout } from "./ChildLayout";
import { ProfileItemChips, SECTION_CHIP_CAP } from "./ProfileItems";
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
              <ButtonLink size="sm" variant="secondary" to={paths.children()}>
                {t("children.child.backToList")}
              </ButtonLink>
            ) : (
              <Button size="sm" variant="secondary" onClick={reload}>
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
            <ButtonLink to={paths.childEdit(child.id, child.wizard.step || 1)} variant="secondary" icon={<PencilLine aria-hidden />}>
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
              <ButtonLink to={paths.childEdit(child.id, WIZARD_REVIEW_STEP)} variant="secondary" icon={<ClipboardCheck aria-hidden />}>
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
        tone="strength"
        empty={t("children.profile.strengthsEmpty")}
        list="strengths"
        items={child.strengths}
        editTo={paths.childEdit(child.id, 2)}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t("children.profile.interests")}
          tone="interest"
          empty={t("children.profile.interestsEmpty")}
          list="interests"
          items={child.interests}
          editTo={paths.childEdit(child.id, 2)}
        />
        <Section
          title={t("children.profile.whatHelps")}
          tone="helps"
          empty={t("children.profile.whatHelpsEmpty")}
          list="what_helps"
          items={child.what_helps}
          editTo={paths.childEdit(child.id, 3)}
        />
      </div>

      <FocusCard child={child} />

      <RecentCard child={child} />

      {summary && (
        <Card>
          <CardHeader title={t("children.profile.understanding")} icon={<Lightbulb className="text-ink-muted" aria-hidden />} />
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
      <Section title={t("children.profile.strengths")} tone="strength" empty={t("children.profile.strengthsEmpty")} list="strengths" items={strengths} />
      <Section title={t("children.profile.interests")} tone="interest" empty={t("children.profile.interestsEmpty")} list="interests" items={interests} />
    </div>
  );
}

/**
 * The four obvious actions of spec §13 (the hero action row, spec 6.7), big enough for
 * a tablet thumb: Add observation (primary), Create content (secondary), View
 * development (soft), Edit profile (ghost).
 */
function ActionBar({ childId }: { childId: string }) {
  const { t } = useI18n();
  const cls = "h-14 w-full whitespace-normal text-center leading-tight";
  return (
    <nav aria-label={t("children.profile.actions.label")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ButtonLink to={paths.childObserve(childId)} size="lg" icon={<ObserveAddIcon paint={false} aria-hidden />} className={cls}>
        {t("children.profile.actions.observe")}
      </ButtonLink>
      <ButtonLink to={paths.newContent(childId)} size="lg" variant="secondary" icon={<ContentIcon aria-hidden />} className={cls}>
        {t("children.profile.actions.content")}
      </ButtonLink>
      <ButtonLink to={paths.childDevelopment(childId)} size="lg" variant="soft" icon={<DevelopmentIcon aria-hidden />} className={cls}>
        {t("children.profile.actions.development")}
      </ButtonLink>
      <ButtonLink to={paths.childEdit(childId, 1)} size="lg" variant="ghost" icon={<PencilLine aria-hidden />} className={cls}>
        {t("children.profile.actions.edit")}
      </ButtonLink>
    </nav>
  );
}

/** Each profile meaning: its tone tile and its painted icon (spec 2.2). */
const SECTION_TONES: Record<"strength" | "interest" | "helps", { tile: string; Icon: KidIcon }> = {
  strength: { tile: "bg-strength-soft", Icon: StrengthsIcon },
  interest: { tile: "bg-interest-soft", Icon: InterestsIcon },
  helps: { tile: "bg-helps-soft", Icon: WhatHelpsIcon },
};

/**
 * Section header row (spec 6.7): a 32px tone tile with the 20px painted icon, the title
 * in `ink` (never tone-coloured), a muted count, and an action at the end.
 */
function SectionHeading({
  id,
  title,
  tile,
  icon,
  count,
  action,
}: {
  id: string;
  title: ReactNode;
  tile: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm [&_svg]:size-5", tile)} aria-hidden>
        {icon}
      </span>
      <h2 id={id} className="font-display text-title min-w-0 font-semibold text-ink">
        {title}
      </h2>
      {count !== undefined && count > 0 && <span className="text-caption tabular text-ink-muted">{count}</span>}
      {action && <div className="ms-auto shrink-0">{action}</div>}
    </div>
  );
}

function Section({
  title,
  tone,
  empty,
  list,
  items,
  editTo,
}: {
  title: string;
  tone: keyof typeof SECTION_TONES;
  empty: string;
  list: string;
  items: ProfileItem[];
  /** The wizard step that edits this section (staff). */
  editTo?: string;
}) {
  const { t } = useI18n();
  const id = `section-${list}`;
  const { tile, Icon } = SECTION_TONES[tone];
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-surface p-4 md:p-5" data-testid={id}>
      <SectionHeading
        id={id}
        title={title}
        tile={tile}
        icon={<Icon />}
        count={items.length}
        action={
          editTo && (
            <Link
              to={editTo}
              aria-label={`${t("common.edit")}: ${title}`}
              title={t("common.edit")}
              className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-tray hover:text-ink"
            >
              <Pencil className="size-5" aria-hidden />
            </Link>
          )
        }
      />
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ProfileItemChips list={list} items={items} tone={tone} cap={SECTION_CHIP_CAP} />
      )}
    </section>
  );
}

function FocusCard({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  const focus = child.focus_areas.slice(0, MAX_FOCUS);
  const full = child.focus_areas.length >= MAX_FOCUS;
  return (
    <section aria-labelledby="section-focus" className="rounded-lg border border-line bg-surface p-4 md:p-5">
      <SectionHeading
        id="section-focus"
        title={t("children.profile.focus")}
        tile="bg-focus-soft"
        icon={<CurrentFocusIcon />}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* All 3 slots set (spec 6.7): a worth-a-look badge, tangerine and never red. */}
            {full && (
              <Badge tone="attention" icon={<AttentionIcon size={14} aria-hidden />}>
                {t("children.profile.focusFull")}
              </Badge>
            )}
            <ButtonLink to={paths.childFocus(child.id)} size="sm" variant="soft" icon={full ? undefined : <Plus aria-hidden />}>
              {t("children.profile.manageFocus")}
            </ButtonLink>
          </div>
        }
      />
      {focus.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("children.profile.focusEmpty")}</p>
      ) : (
        <ol className="space-y-2" data-testid="focus-list">
          {focus.map((f, i) => (
            <FocusRow key={f.id} childId={child.id} focus={f} n={i + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** A focus row (spec 6.7): `focus-soft`, a 22px grape numeral block, the title in ink. */
function FocusRow({ childId, focus, n }: { childId: string; focus: FocusAreaSummary; n: number }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const [open, setOpen] = useState(false);
  const steps = PLAN_STEPS.filter((k) => typeof focus.plan?.[k] === "string" && focus.plan[k]!.trim());
  return (
    <li className="rounded-md bg-focus-soft px-3 py-2">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
        <NumeralBlock n={n} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink" dir="auto">
            {focus.title}
          </p>
          <p className="text-caption text-ink-muted">{optionLabel("priority_categories", focus.category)}</p>
          {focus.description && (
            <p className="mt-1 text-sm text-ink" dir="auto">
              {focus.description}
            </p>
          )}
        </div>
        <ButtonLink
          to={paths.newContent(childId, { mode: "growth_support", focus: focus.id })}
          size="sm"
          variant="secondary"
          icon={<ContentIcon aria-hidden />}
        >
          {t("children.profile.focusCreate")}
        </ButtonLink>
      </div>
      {steps.length > 0 && (
        <div className="ps-[34px]">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-focus-ink hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? t("children.profile.hidePlan") : t("children.profile.showPlan")}
          </button>
          {open && (
            <ol className="mb-1 space-y-2">
              {steps.map((k, i) => (
                <li key={k} className="flex gap-2 text-sm">
                  {i > 0 ? (
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-muted rtl:-scale-x-100" aria-hidden />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <span className="font-semibold text-ink">{t(`children.profile.plan.${k}`)}: </span>
                    <span dir="auto" className="text-ink">
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

/** Recent development (spec 6.7): the latest quote in a tray well, with the note-quote icon. */
function RecentCard({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { item, labelOf } = useOptions();
  const latest = child.latest_observation;
  const support = latest?.support_level ? item("support_levels", latest.support_level) : undefined;
  return (
    <section aria-labelledby="section-recent" className="rounded-lg border border-line bg-surface p-4 md:p-5">
      <SectionHeading
        id="section-recent"
        title={t("children.profile.recent")}
        tile="bg-tray"
        icon={<NoteQuoteIcon />}
        action={
          <ButtonLink to={paths.childObserve(child.id)} size="sm" variant="soft" icon={<ObserveAddIcon paint={false} aria-hidden />}>
            {t("children.profile.actions.observe")}
          </ButtonLink>
        }
      />
      {!latest ? (
        <p className="text-sm text-ink-muted">{t("children.profile.recentEmpty")}</p>
      ) : (
        <figure className="rounded-md bg-tray px-4 py-3">
          <blockquote className="text-base leading-relaxed text-ink" dir="auto">
            {latest.observation}
          </blockquote>
          <figcaption className="text-caption tabular mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted">
            <span>{t("children.profile.lastObserved", { date: formatDate(latest.observed_at) })}</span>
            {support && <span className="rounded-sm bg-surface px-2 py-0.5 font-medium text-ink">{labelOf(support)}</span>}
          </figcaption>
        </figure>
      )}
      <Link to={paths.childTimeline(child.id)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand hover:underline">
        {t("children.profile.timelineLink")}
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
      </Link>
    </section>
  );
}
