/**
 * /children/:id/content/new — Create content (spec §16).
 * 1. Goal: Strength Builder ("Build what is strong") or Growth Support ("Support
 *    what is difficult"), then one active focus area or one strength.
 * 2. What to create: Story, Video, Digital game (optional game type),
 *    Real-world activity or Small pack (video only when switched on).
 * 3. Language (defaults to the child's main language).
 * Generate → a draft to review. Query: ?mode=&focus=&strength=&type= preselect.
 */
import { useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Wand } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, Checkbox, EmptyState, NumeralBlock, PageHeader, PageSkeleton, Spinner, ToggleChip } from "@/components/ui";
import { CurrentFocusIcon } from "@/icons";
import { childUrl, displayName, isStaffView, type ChildDetail } from "@/features/children";
import { GAME_TEMPLATES, type GameTemplate } from "@/features/player";
import { LOCALE_NAMES, LOCALES, isLocale, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { GENERATE_TYPES, MODES, generateContent, type GenerateBody, type GenerateType, type Mode } from "./api";
import { ChoiceTile, MODE_ICONS, TypeIcon } from "./ui";

const asMode = (v: string | null): Mode | null => (MODES as string[]).includes(v ?? "") ? (v as Mode) : null;
const asType = (v: string | null): GenerateType | null => (GENERATE_TYPES as string[]).includes(v ?? "") ? (v as GenerateType) : null;

export function CreateContentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, reload } = useFetch<{ child: ChildDetail }>(childUrl(id));
  const back = { to: paths.childContent(id), label: t("content.create.backToContent") };

  if (!data) {
    if (error)
      return (
        <div className="mx-auto max-w-3xl">
          <PageHeader back={back} title={t("content.create.title")} />
          <Alert tone="error" action={error.status !== 404 ? <Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button> : undefined}>
            {toMessage(error)}
          </Alert>
        </div>
      );
    return <PageSkeleton />;
  }
  return <CreateForm childId={id} child={data.child} />;
}

function Step({ n, title, hint, children }: { n: number; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby={`create-step-${n}`}>
      <div className="flex items-start gap-3">
        <span className="font-display tabular flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand text-base font-bold text-on-brand" aria-hidden>
          {n}
        </span>
        <div>
          <h2 id={`create-step-${n}`} className="font-display text-title font-semibold text-ink">
            {title}
          </h2>
          {hint && <p className="text-sm text-ink-muted">{hint}</p>}
        </div>
      </div>
      <div className="ps-0 sm:ps-11">{children}</div>
    </section>
  );
}

function CreateForm({ childId, child }: { childId: string; child: ChildDetail }) {
  const { t, locale } = useI18n();
  const { list, labelOf, optionLabel } = useOptions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pending, run } = useAction();
  const staff = isStaffView(child) ? child : null;
  const focusAreas = staff?.focus_areas ?? [];
  const name = displayName(child);

  const [mode, setMode] = useState<Mode | null>(asMode(params.get("mode")));
  const [focusId, setFocusId] = useState<string | null>(params.get("focus"));
  const [strength, setStrength] = useState<string | null>(params.get("strength"));
  const [type, setType] = useState<GenerateType | null>(asType(params.get("type")));
  const [template, setTemplate] = useState<GameTemplate | null>(null);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [language, setLanguage] = useState<AppLocale>(isLocale(child.main_language) ? child.main_language : locale);

  // One active focus: preselect it.
  const chosenFocus = focusAreas.some((f) => f.id === focusId) ? focusId : focusAreas.length === 1 ? focusAreas[0]!.id : null;

  const ownStrengths = Array.from(new Set(child.strengths.map((s) => s.key).filter((k): k is string => !!k)));
  const targets = list("strength_targets").filter((o) => !ownStrengths.includes(o.key));
  const strengthName = (key: string) => {
    const own = optionLabel("strengths", key);
    return own !== key ? own : optionLabel("strength_targets", key);
  };

  const missing =
    !mode ? t("content.create.pickGoal") : mode === "growth_support" && !chosenFocus ? t("content.create.pickFocus") : mode === "strength_builder" && !strength ? t("content.create.pickStrength") : !type ? t("content.create.pickType") : null;

  async function submit() {
    if (missing || !mode || !type) return;
    const body: GenerateBody = { mode, content_type: type, language };
    if (mode === "growth_support" && chosenFocus) body.focus_area_id = chosenFocus;
    if (mode === "strength_builder" && strength) body.target_strength = strength;
    if (type === "digital_game" && template) body.template = template;
    if (type === "pack" && includeVideo) body.include_video = true;
    const r = await run(() => generateContent(childId, body), { success: t("content.create.ready") });
    if (r.ok) {
      if (r.data.pack_id) navigate(paths.pack(r.data.pack_id));
      else if (r.data.content) navigate(paths.content(r.data.content.id));
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ to: paths.childContent(childId), label: t("content.create.backToContent") }} icon={<Wand />} title={t("content.create.titleFor", { name })} />

      {pending ? (
        <Card className="mx-auto max-w-xl" data-testid="generating">
          <CardBody className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
            <Spinner className="size-10 text-brand" />
            <p className="text-lg font-semibold text-ink">{t("content.create.generating")}</p>
            <p className="max-w-sm text-sm text-ink-muted">{t("content.create.generatingHint")}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-10">
          <Step n={1} title={t("content.create.goalStep")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["strength_builder", "growth_support"] as const).map((m) => {
                const Icon = MODE_ICONS[m];
                return (
                  <ChoiceTile
                    key={m}
                    testId={`mode-${m}`}
                    selected={mode === m}
                    onSelect={() => setMode(m)}
                    icon={
                      <span
                        className={cn(
                          "flex size-14 shrink-0 items-center justify-center rounded-md text-ink [&_svg]:size-10",
                          m === "strength_builder" ? "bg-strength-soft" : "bg-focus-soft",
                        )}
                        aria-hidden
                      >
                        <Icon />
                      </span>
                    }
                    title={t(`content.modes.${m}`)}
                    hint={t(`content.modeHints.${m}`)}
                  />
                );
              })}
            </div>

            {mode === "growth_support" && (
              <div className="mt-6 space-y-3">
                <h3 className="text-base font-semibold text-ink">{t("content.create.focusStep")}</h3>
                {focusAreas.length === 0 ? (
                  <EmptyState
                    icon={<CurrentFocusIcon paint="var(--paint-grape)" />}
                    title={t("content.create.noFocus")}
                    description={t("content.create.noFocusHint")}
                    action={
                      <ButtonLink variant="outline" to={paths.childFocus(childId)}>
                        {t("content.create.openFocus")}
                      </ButtonLink>
                    }
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t("content.create.focusStep")}>
                    {focusAreas.map((f, i) => (
                      <ChoiceTile
                        key={f.id}
                        testId="focus-choice"
                        selected={chosenFocus === f.id}
                        onSelect={() => setFocusId(f.id)}
                        icon={
                          <NumeralBlock n={i + 1} className="mt-0.5" />
                        }
                        title={f.title}
                        hint={f.plan?.what_we_will_do || f.description || undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === "strength_builder" && (
              <div className="mt-6 space-y-4" role="radiogroup" aria-label={t("content.create.strengthStep")}>
                <h3 className="text-base font-semibold text-ink">{t("content.create.strengthStep")}</h3>
                {ownStrengths.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">{t("content.create.childStrengths", { name })}</p>
                    <div className="flex flex-wrap gap-2">
                      {ownStrengths.map((k) => (
                        <ToggleChip key={k} tone="strength" single selected={strength === k} onToggle={() => setStrength(k)}>
                          {strengthName(k)}
                        </ToggleChip>
                      ))}
                    </div>
                  </div>
                )}
                {targets.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">{t("content.create.moreStrengths")}</p>
                    <div className="flex flex-wrap gap-2">
                      {targets.map((o) => (
                        <ToggleChip key={o.key} tone="strength" single icon={o.icon} selected={strength === o.key} onToggle={() => setStrength(o.key)}>
                          {labelOf(o)}
                        </ToggleChip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n={2} title={t("content.create.typeStep")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GENERATE_TYPES.map((k) => (
                <ChoiceTile
                  key={k}
                  testId={`type-${k}`}
                  selected={type === k}
                  onSelect={() => setType(k)}
                  icon={<TypeIcon type={k} size="lg" />}
                  title={t(`content.types.${k}`)}
                  hint={t(`content.typeHints.${k}`)}
                />
              ))}
            </div>
            {type === "digital_game" && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-ink">{t("content.create.templateLabel")}</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("content.create.templateLabel")}>
                  <ToggleChip single selected={template === null} onToggle={() => setTemplate(null)}>
                    {t("content.create.templateAuto")}
                  </ToggleChip>
                  {GAME_TEMPLATES.map((g) => (
                    <ToggleChip key={g} single selected={template === g} onToggle={() => setTemplate(g)}>
                      {t(`content.templates.${g}`)}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            )}
            {type === "pack" && (
              <div className="mt-5 rounded-lg border border-line bg-surface px-4 py-2">
                <Checkbox label={t("content.create.includeVideo")} checked={includeVideo} onChange={(e) => setIncludeVideo(e.target.checked)} />
                <p className="pb-2 text-caption text-ink-muted">{t("content.create.includeVideoHint")}</p>
              </div>
            )}
            {type === "video" && (
              <Alert tone="info" className="mt-5">
                {t("content.create.videoNote")}
              </Alert>
            )}
          </Step>

          <Step n={3} title={t("content.create.languageStep")} hint={t("content.create.languageHint")}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("content.create.languageStep")}>
              {LOCALES.map((l) => (
                <ToggleChip key={l} single selected={language === l} onToggle={() => setLanguage(l)}>
                  <span lang={l}>{LOCALE_NAMES[l]}</span>
                </ToggleChip>
              ))}
            </div>
          </Step>

          <div className="flex flex-col items-stretch gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-end">
            {missing && <p className="text-sm text-ink-muted sm:me-auto">{missing}</p>}
            <Button size="xl" onClick={() => void submit()} disabled={!!missing} icon={<Wand className="size-6" aria-hidden />}>
              {t("content.create.generate")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
