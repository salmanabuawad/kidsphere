import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, ClipboardCheck, ClipboardList, HeartHandshake, Lightbulb, Lock, MessageCircleQuestion, Pencil, PencilLine, Phone, Plus, Utensils } from "lucide-react";
import { ProvenanceBadge, ProvenanceBadges, type ProvenanceEntry } from "@/components/source";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Chip, NumeralBlock, PageSkeleton } from "@/components/ui";
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
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useSourceModel } from "@/lib/sourceModel";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { assessmentsUrl, childUrl, displayName, isStaffView, profileUrl, WIZARD_REVIEW_STEP } from "./api";
import { ChildLayout } from "./ChildLayout";
import { mainFirst, nextReviewOn, overviewData, type GoodToKnowRow, type OverviewData, type ReviewLater } from "./overview";
import { ProfileItemChips, SECTION_CHIP_CAP, useProfileItem } from "./ProfileItems";
import { parentSaid } from "./provenance";
import type { AssessmentsSummary, ChildDetail, ChildStaffView, FocusAreaSummary, FocusPlan, ProfileItem, ProfileResponse } from "./types";

const PLAN_STEPS: (keyof FocusPlan)[] = ["strength_used", "need", "adaptation", "what_we_will_do", "success_looks_like"];
const MAX_FOCUS = 3;

/** /children/:id — the Overview tab: who this child is, at a glance (spec §13, COVERAGE-MATRIX §5.1). */
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
      {isStaffView(child) ? <StaffOverview child={child} /> : <BasicProfile strengths={child.strengths} interests={child.interests} />}
    </ChildLayout>
  );
}

/**
 * The staff Overview, in the observation model's closing order (OM-D99-01): who the child
 * is (from the heart, good to know) → where they succeed (strengths, interests, what
 * helps) → where they need support and what we do (current focus, recent development) →
 * next steps. Every chip carries visible provenance badges (X-22).
 */
function StaffOverview({ child }: { child: ChildStaffView }) {
  const { t } = useI18n();
  // The questionnaire, the quick baseline and the section statuses (WP2-PQ), and the
  // teacher observation cycle (WP2-TO). Both are optional: the Overview works without them.
  const profile = useFetch<ProfileResponse>(profileUrl(child.id));
  const assessments = useFetch<AssessmentsSummary>(assessmentsUrl(child.id));
  const data = overviewData(profile.data, assessments.data ?? null);
  const lists = {
    strengths: profile.data?.strengths ?? child.strengths,
    interests: profile.data?.interests ?? child.interests,
    what_helps: profile.data?.what_helps ?? child.what_helps,
  };
  const summary = typeof child.current_understanding?.summary === "string" ? child.current_understanding.summary : null;

  return (
    <div className="space-y-5">
      <ActionBar childId={child.id} />

      {(data.heart || data.describeWords.length > 0) && <HeartCard data={data} name={displayName(child)} />}

      <GoodToKnowCard child={child} data={data} />

      <Section
        title={t("children.profile.strengths")}
        tone="strength"
        empty={t("children.profile.strengthsEmpty")}
        list="strengths"
        items={lists.strengths}
        editTo={paths.childEdit(child.id, 2)}
        mainFirst
      >
        {data.appreciate && (
          <QuoteBlock label={t("children.overview.appreciate")} text={data.appreciate.text} provenance={[parentSaid(data.appreciate.stamp)]} />
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t("children.profile.interests")}
          tone="interest"
          empty={t("children.profile.interestsEmpty")}
          list="interests"
          items={lists.interests}
          editTo={paths.childEdit(child.id, 2)}
        />
        <Section
          title={t("children.profile.whatHelps")}
          tone="helps"
          empty={t("children.profile.whatHelpsEmpty")}
          list="what_helps"
          items={lists.what_helps}
          editTo={paths.childEdit(child.id, 3)}
        />
      </div>

      <FocusCard child={child} />

      <RecentCard child={child} />

      {summary && (
        <Card>
          <CardHeader
            title={t("children.profile.understanding")}
            icon={<Lightbulb className="text-ink-muted" aria-hidden />}
            action={<ProvenanceBadges kinds={["teacher_approved"]} />}
          />
          <CardBody>
            <p className="leading-relaxed text-ink" dir="auto">
              {summary}
            </p>
          </CardBody>
        </Card>
      )}

      <PromptsCard child={child} data={data} cycleId={assessments.data?.current?.id ?? null} />
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

/** A labelled quote of someone's own words, with its provenance. */
function QuoteBlock({ label, text, provenance, className }: { label: ReactNode; text: string; provenance: ProvenanceEntry[]; className?: string }) {
  return (
    <figure className={cn("rounded-md bg-tray px-4 py-3", className)}>
      <figcaption className="text-caption mb-1 flex flex-wrap items-center gap-2 font-medium text-ink-muted">
        <span>{label}</span>
        <ProvenanceBadges kinds={provenance} />
      </figcaption>
      <blockquote className="text-base leading-relaxed text-ink" dir="auto">
        {text}
      </blockquote>
    </figure>
  );
}

/**
 * "From the heart" (PQ-HRT-01): the family's one message before the teacher meets the
 * child, prominent and staff only (PARENT SAID). "In the family's words" (PQ-INTRO-05)
 * sits under it. Never shown to other families and never used in content.
 */
function HeartCard({ data, name }: { data: OverviewData; name: string }) {
  const { t } = useI18n();
  const resolve = useProfileItem();
  const heart = data.heart;
  return (
    <section aria-labelledby="section-heart" className="rounded-lg border border-line bg-accent-soft p-4 md:p-5" data-testid="section-heart">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface [&_svg]:size-5" aria-hidden>
          <HeartHandshake className="text-accent-strong" />
        </span>
        <h2 id="section-heart" className="font-display text-title min-w-0 font-semibold text-ink">
          {t("children.overview.heart.title")}
        </h2>
        <span className="text-caption ms-auto inline-flex items-center gap-1 text-ink-muted">
          <Lock className="size-3.5" aria-hidden />
          {t("children.overview.heart.private")}
        </span>
      </div>
      {heart && (
        <figure>
          <figcaption className="text-caption mb-1 flex flex-wrap items-center gap-2 text-ink-muted">
            <span>{t("children.overview.heart.intro", { name })}</span>
            <ProvenanceBadges kinds={[parentSaid(heart.stamp)]} />
          </figcaption>
          <blockquote className="font-display text-lg leading-relaxed text-ink" dir="auto">
            {heart.message}
          </blockquote>
        </figure>
      )}
      {data.describeWords.length > 0 && (
        <div className={cn(heart && "mt-4")}>
          <p className="text-caption mb-2 flex flex-wrap items-center gap-2 font-medium text-ink-muted">
            <span>{t("children.overview.familyWords")}</span>
            <ProvenanceBadges kinds={["parent_said"]} />
          </p>
          <ul className="flex flex-wrap gap-2">
            {data.describeWords.map((w, i) => (
              <li key={w.key ?? w.custom ?? i}>
                <Chip tone="outline">{resolve("describe_words", w).label}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * "Good to know" (§5.1): the most important thing, routines to keep, what may be too much,
 * the teacher's "remember" lines, and staff-only indicators for food and health notes that
 * link to the Parent View. The health text itself is never shown here.
 */
function GoodToKnowCard({ child, data }: { child: ChildStaffView; data: OverviewData }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const contact = child.parent_contact?.trim();
  const reach = data.reach;
  if (!data.goodToKnow.length && !data.foodNote && !data.medicalNote && !reach) return null;
  const health = paths.childParentView(child.id, { section: "health" });
  return (
    <section aria-labelledby="section-good-to-know" className="rounded-lg border border-line bg-surface p-4 md:p-5" data-testid="section-good-to-know">
      <SectionHeading id="section-good-to-know" title={t("children.overview.goodToKnow.title")} tile="bg-tray" icon={<ClipboardList className="text-ink" />} />
      {data.goodToKnow.length > 0 && (
        <dl className="space-y-3">
          {data.goodToKnow.map((row, i) => (
            <GoodToKnowItem key={`${row.key}-${i}`} row={row} />
          ))}
        </dl>
      )}
      {(data.foodNote || data.medicalNote) && (
        <ul className={cn("flex flex-wrap gap-2", data.goodToKnow.length > 0 && "mt-4")} aria-label={t("children.overview.goodToKnow.notes")}>
          {data.foodNote && (
            <li>
              <NoteLink to={health} icon={<Utensils aria-hidden />} testId="note-food">
                {t("children.overview.goodToKnow.foodNote")}
              </NoteLink>
            </li>
          )}
          {data.medicalNote && (
            <li>
              <NoteLink to={health} icon={<AttentionIcon size={16} aria-hidden />} testId="note-medical">
                {t("children.overview.goodToKnow.medicalNote")}
              </NoteLink>
            </li>
          )}
        </ul>
      )}
      {reach && (
        <div className="mt-4 rounded-md bg-tray px-4 py-3" data-testid="reach-family">
          <p className="text-caption mb-1 flex flex-wrap items-center gap-2 font-medium text-ink-muted">
            <Phone className="size-4" aria-hidden />
            <span>{t("children.overview.goodToKnow.reach")}</span>
            <ProvenanceBadges kinds={[parentSaid(reach.stamp)]} />
          </p>
          <p className="text-ink">
            {[...reach.channels.filter((k) => k !== "other").map((k) => optionLabel("contact_preferences", k)), ...(reach.other ? [reach.other] : [])].join(" · ")}
          </p>
          {reach.matters && (
            <p className="mt-1 text-sm text-ink" dir="auto">
              <span className="font-medium">{t("children.overview.goodToKnow.communication")}: </span>
              {reach.matters}
            </p>
          )}
          {contact && (
            <p className="mt-1 text-sm text-ink-muted">
              {t("children.overview.goodToKnow.contact")}: <bdi dir="ltr">{contact}</bdi>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function GoodToKnowItem({ row }: { row: GoodToKnowRow }) {
  const { t } = useI18n();
  const provenance: ProvenanceEntry[] = row.from === "parent" ? [parentSaid(row.stamp)] : ["teacher_observed"];
  return (
    <div data-testid={`good-${row.key}`}>
      <dt className="text-caption flex flex-wrap items-center gap-2 font-medium text-ink-muted">
        <span>{t(`children.overview.goodToKnow.${row.key}`)}</span>
        <ProvenanceBadges kinds={provenance} />
      </dt>
      <dd className="mt-0.5 text-base leading-relaxed text-ink" dir="auto">
        {row.text}
      </dd>
    </div>
  );
}

function NoteLink({ to, icon, children, testId }: { to: string; icon: ReactNode; children: ReactNode; testId: string }) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      data-testid={testId}
      className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line-strong bg-surface px-3 text-sm font-medium text-ink underline-offset-2 hover:bg-tray hover:underline [&_svg]:size-4"
    >
      {icon}
      <span>{children}</span>
      <span className="sr-only"> · {t("children.overview.goodToKnow.openParentView")}</span>
      <ArrowRight className="text-ink-muted rtl:-scale-x-100" aria-hidden />
    </Link>
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
  mainFirst: splitMain,
  children,
}: {
  title: string;
  tone: keyof typeof SECTION_TONES;
  empty: string;
  list: string;
  items: ProfileItem[];
  /** The wizard step that edits this section (staff). */
  editTo?: string;
  /** Strengths: the 3 main strengths (⭐, quick baseline) come first, on their own row. */
  mainFirst?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const id = `section-${list}`;
  const { tile, Icon } = SECTION_TONES[tone];
  const ordered = splitMain ? mainFirst(items) : items;
  const main = splitMain ? ordered.filter((i) => i.main) : [];
  const rest = splitMain ? ordered.filter((i) => !i.main) : ordered;
  const staff = !!editTo;
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
        <div className="space-y-3">
          {main.length > 0 && (
            <div data-testid="main-strengths">
              <p className="text-caption mb-2 font-semibold text-ink">
                <span aria-hidden>⭐ </span>
                {t("children.overview.mainStrengths")}
              </p>
              <ProfileItemChips list={list} items={main} tone={tone} provenance={staff} />
            </div>
          )}
          {rest.length > 0 && <ProfileItemChips list={list} items={rest} tone={tone} cap={SECTION_CHIP_CAP} provenance={staff} />}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
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
            <ButtonLink to={paths.childPlan(child.id)} size="sm" variant="soft" icon={full ? undefined : <Plus aria-hidden />}>
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

/** A focus row (spec 6.7): `focus-soft`, a 22px grape numeral block, the title in ink, the next review date. */
function FocusRow({ childId, focus, n }: { childId: string; focus: FocusAreaSummary; n: number }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { formatDate } = useFormat();
  const [open, setOpen] = useState(false);
  const steps = PLAN_STEPS.filter((k) => typeof focus.plan?.[k] === "string" && focus.plan[k]!.trim());
  const review = nextReviewOn(focus);
  return (
    <li className="rounded-md bg-focus-soft px-3 py-2">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
        <NumeralBlock n={n} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink" dir="auto">
            {focus.title}
          </p>
          <p className="text-caption flex flex-wrap gap-x-3 text-ink-muted">
            <span>{optionLabel("priority_categories", focus.category)}</span>
            {review && (
              <span data-testid="focus-next-review">
                {t("children.overview.nextReview", { date: formatDate(`${review}T12:00:00`) })}
              </span>
            )}
          </p>
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
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const { item } = useOptions();
  const latest = child.latest_observation;
  const support = latest?.support_level ? item("support_levels", latest.support_level) : undefined;
  const supportLabel = support ? pick(support.short ?? support.label, locale) || support.key : null;
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
            {supportLabel && <span className="rounded-sm bg-surface px-2 py-0.5 font-medium text-ink">{supportLabel}</span>}
            <ProvenanceBadge kind="teacher_observed" />
          </figcaption>
        </figure>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5">
        <Link to={paths.childObservations(child.id)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline">
          {t("children.overview.allObservations")}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
        <Link to={paths.childDevelopmentTimeline(child.id)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline">
          {t("children.profile.timelineLink")}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/**
 * Next steps (§5.1 "Prompts"): finish the profile, create the baseline, the quick baseline
 * once the family's answers arrived, the open question for the family, and everything a
 * teacher marked "Review later". Nothing is shown when there is nothing to do.
 */
function PromptsCard({ child, data, cycleId }: { child: ChildStaffView; data: OverviewData; cycleId: string | null }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const name = displayName(child);
  const wizardDone = !!child.wizard.completed_at;
  const prompts: ReactNode[] = [];

  if (!wizardDone)
    prompts.push(
      <Alert
        key="continue"
        tone="tip"
        title={t("children.profile.continueTitle")}
        action={
          <ButtonLink to={paths.childEdit(child.id, child.wizard.step || 1)} variant="secondary" icon={<PencilLine aria-hidden />}>
            {t("children.profile.continueAction")}
          </ButtonLink>
        }
      >
        {t("children.profile.continueBody", { name })}
      </Alert>,
    );
  else if (!child.baseline.exists)
    prompts.push(
      <Alert
        key="baseline"
        tone="info"
        title={t("children.profile.baselineTitle")}
        action={
          <ButtonLink to={paths.childEdit(child.id, WIZARD_REVIEW_STEP)} variant="secondary" icon={<ClipboardCheck aria-hidden />}>
            {t("children.profile.baselineAction")}
          </ButtonLink>
        }
      >
        {t("children.profile.baselineBody", { name })}
      </Alert>,
    );

  if (data.questionnaireSubmitted && !data.bridgeStarted)
    prompts.push(
      <Alert
        key="quick-baseline"
        tone="info"
        title={t("children.overview.prompts.familyAnswersTitle")}
        action={
          <ButtonLink to={paths.childQuickBaseline(child.id)} variant="secondary" icon={<ClipboardCheck aria-hidden />}>
            {t("children.overview.prompts.quickBaselineAction")}
          </ButtonLink>
        }
      >
        {t("children.overview.prompts.familyAnswersBody", { name })}
      </Alert>,
    );

  if (data.openQuestion)
    prompts.push(
      <div key="question" className="rounded-md bg-tray px-4 py-3" data-testid="open-question">
        <p className="text-caption mb-1 flex flex-wrap items-center gap-2 font-medium text-ink-muted">
          <MessageCircleQuestion className="size-4" aria-hidden />
          <span>{t("children.overview.prompts.openQuestion")}</span>
          <ProvenanceBadges kinds={["teacher_observed"]} />
        </p>
        <p className="text-base text-ink" dir="auto">
          {data.openQuestion}
        </p>
        <Link to={paths.childQuickBaseline(child.id)} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-2">
          {t("children.overview.prompts.openQuestionAction")}
        </Link>
      </div>,
    );

  if (data.reviewLaterDomains.length || data.reviewLater.length)
    prompts.push(
      <div key="later" className="rounded-md bg-tray px-4 py-3" data-testid="review-later">
        <p className="text-caption mb-2 font-medium text-ink-muted">{t("children.overview.prompts.reviewLater")}</p>
        <ul className="flex flex-wrap gap-2">
          {data.reviewLaterDomains.map((d) => (
            <li key={`d:${d}`}>
              <PromptLink to={paths.childTeacherObservation(child.id, { cycle: cycleId, domain: d })}>{optionLabel("observation_domains", d)}</PromptLink>
            </li>
          ))}
          {data.reviewLater.map((s) => (
            <li key={`${s.perspective}:${s.section}`}>
              <ReviewLaterSection childId={child.id} later={s} />
            </li>
          ))}
        </ul>
      </div>,
    );

  if (!prompts.length) return null;
  return (
    <section aria-labelledby="section-prompts" className="space-y-3" data-testid="section-prompts">
      <h2 id="section-prompts" className="font-display text-title font-semibold text-ink">
        {t("children.overview.prompts.title")}
      </h2>
      {prompts}
    </section>
  );
}

function PromptLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1 rounded-sm border border-line-strong bg-surface px-3 text-sm font-medium text-ink underline-offset-2 hover:underline"
    >
      <span dir="auto">{children}</span>
      <ArrowRight className="size-4 text-ink-muted rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

/** A questionnaire / quick-baseline section marked "Review later", labelled from the source registry. */
function ReviewLaterSection({ childId, later }: { childId: string; later: ReviewLater }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  if (later.perspective === "teacher")
    return <PromptLink to={paths.childQuickBaseline(childId)}>{t("children.overview.prompts.quickBaseline")}</PromptLink>;
  const sec = sm.section("parent_questionnaire", later.section);
  return (
    <PromptLink to={paths.childParentView(childId, { section: later.section })}>
      {sec ? sm.label(sec) : t("children.overview.prompts.parentSection")}
    </PromptLink>
  );
}
