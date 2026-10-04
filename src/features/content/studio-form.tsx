"use client";

import type { AttributeCategory, ContentType } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_NAMES, type AppLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { vocabEntry } from "@/features/child-understanding/vocabulary";

type ChildOption = { id: string; displayName: string; primaryLanguage: AppLocale; goals: { id: string; statement: string }[] };
type Proposals = { interests: string[]; strengths: string[]; supports: string[]; avoid: string[] };
type Options = {
  goal: { id: string; statement: string };
  proposals: Proposals;
  available: Proposals;
  characters: { id: string; label: string; relation: string }[];
  enabledLocales: AppLocale[];
};

const TYPES: ContentType[] = [
  "INTERACTIVE_STORY",
  "STORY",
  "SOCIAL_STORY",
  "VISUAL_ROUTINE",
  "CHOICE_ACTIVITY",
  "MATCHING_ACTIVITY",
  "SIMPLE_GAME",
  "MOVEMENT_ACTIVITY",
  "ROLE_PLAY_ACTIVITY",
  "PARENT_HOME_ACTIVITY",
  "TEACHER_DISCUSSION_ACTIVITY",
];

const GROUPS: { key: keyof Proposals; category: AttributeCategory; labelKey: "interest" | "strength" | "support" | "avoid"; limit: number }[] = [
  { key: "interests", category: "INTEREST", labelKey: "interest", limit: 2 },
  { key: "strengths", category: "STRENGTH", labelKey: "strength", limit: 2 },
  { key: "supports", category: "SUPPORT", labelKey: "support", limit: 3 },
  { key: "avoid", category: "TRIGGER", labelKey: "avoid", limit: 3 },
];

export function StudioForm({
  childOptions: children,
  initialChildId,
  initialGoalId,
  usesDemo,
}: {
  childOptions: ChildOption[];
  initialChildId?: string;
  initialGoalId?: string;
  usesDemo: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const [childId, setChildId] = useState(initialChildId && children.some((c) => c.id === initialChildId) ? initialChildId : (children[0]?.id ?? ""));
  const child = children.find((c) => c.id === childId);
  const [goalId, setGoalId] = useState(initialGoalId && child?.goals.some((g) => g.id === initialGoalId) ? initialGoalId : (child?.goals[0]?.id ?? ""));
  const [type, setType] = useState<ContentType>("INTERACTIVE_STORY");
  const [language, setLanguage] = useState<AppLocale>(child?.primaryLanguage ?? "ar");
  const [duration, setDuration] = useState(5);
  const [theme, setTheme] = useState("");
  const [instruction, setInstruction] = useState("");
  // Options are keyed by goal+type; "loading" is derived instead of set inside the effect.
  const requestKey = goalId ? `${goalId}:${type}` : "";
  const [result, setResult] = useState<{ key: string; options: Options | null } | null>(null);
  const [include, setInclude] = useState<Proposals>({ interests: [], strengths: [], supports: [], avoid: [] });
  const [characters, setCharacters] = useState<string[]>([]);
  const loading = !!requestKey && result?.key !== requestKey;
  const options = result?.key === requestKey ? result.options : null;

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    api<Options>(`/api/goals/${goalId}/generate?type=${type}`)
      .then((o) => {
        if (cancelled) return;
        setResult({ key: requestKey, options: o });
        setInclude(o.proposals);
        setCharacters((prev) => prev.filter((id) => o.characters.some((c) => c.id === id)));
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, options: null });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, goalId, type]);

  function pickChild(id: string) {
    setChildId(id);
    const c = children.find((x) => x.id === id);
    setGoalId(c?.goals[0]?.id ?? "");
    if (c) setLanguage(c.primaryLanguage);
    setCharacters([]);
  }

  async function generate() {
    const content = await run(
      () =>
        api<{ id: string }>(`/api/goals/${goalId}/generate`, {
          body: {
            contentType: type,
            language,
            durationMinutes: duration,
            theme: theme || null,
            include,
            characterAssetIds: characters,
            teacherInstruction: instruction || null,
          },
        }),
      { success: t("teacher.studio.generated"), refresh: false },
    );
    if (content) router.push(`/teacher/content/${content.id}`);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("teacher.studio.child")}>
            {(p) => (
              <Select {...p} value={childId} onChange={(e) => pickChild(e.target.value)} data-testid="studio-child">
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("teacher.studio.goal")}>
            {(p) => (
              <Select {...p} value={goalId} onChange={(e) => setGoalId(e.target.value)} disabled={!child?.goals.length} data-testid="studio-goal">
                {!child?.goals.length && <option value="">{t("teacher.studio.noGoals")}</option>}
                {child?.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.statement}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {child && child.goals.length === 0 && (
          <Alert
            tone="info"
            action={
              <Link href={`/teacher/children/${child.id}/goals/new`} className="text-sm font-medium underline">
                {t("teacher.child.newGoal")}
              </Link>
            }
          >
            {t("teacher.studio.noGoals")}
          </Alert>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("teacher.studio.type")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                aria-pressed={type === ty}
                onClick={() => setType(ty)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-start text-sm",
                  type === ty ? "border-brand bg-brand/10 text-brand font-medium" : "border-line hover:bg-stone-50",
                )}
              >
                {t(`enums.contentType.${ty}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("teacher.studio.language")}>
            {(p) => (
              <Select {...p} value={language} onChange={(e) => setLanguage(e.target.value as AppLocale)} data-testid="studio-language">
                {(options?.enabledLocales ?? (["ar", "he", "en"] as AppLocale[])).map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("teacher.studio.duration")}>
            {(p) => (
              <Select {...p} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[3, 5, 8, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {t("common.minutes", { n: m })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("teacher.studio.theme")}>
            {(p) => <Input {...p} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t("teacher.studio.themePlaceholder")} />}
          </Field>
        </div>
        <Field label={t("teacher.studio.instruction")}>
          {(p) => <Textarea {...p} rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />}
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">{t("teacher.studio.characters")}</p>
          {(options?.characters.length ?? 0) === 0 ? (
            <p className="text-muted text-sm" data-testid="no-characters">
              {t("teacher.studio.charactersEmpty")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="character-options">
              {options!.characters.map((c) => {
                const on = characters.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCharacters(on ? characters.filter((x) => x !== c.id) : [...characters, c.id].slice(0, 3))}
                    className={cn("flex items-center gap-2 rounded-2xl border p-1.5 pe-3 text-sm", on ? "border-brand bg-brand/10" : "border-line")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, authorized image route */}
                    <img src={`/api/media/${c.id}/file`} alt="" className="size-9 rounded-xl object-cover" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5 lg:sticky lg:top-6">
          <p className="font-semibold">{t("teacher.studio.personalize")}</p>
          <p className="text-muted mb-4 text-xs">{t("teacher.studio.personalizeHint")}</p>
          {loading && <Skeleton className="h-40" />}
          {!loading && options && (
            <dl className="space-y-3 text-sm" data-testid="personalization">
              <div>
                <dt className="text-muted text-xs tracking-wide uppercase">{t("teacher.studio.goalLine")}</dt>
                <dd className="font-medium">{options.goal.statement}</dd>
              </div>
              {GROUPS.map((g) => (
                <div key={g.key}>
                  <dt className="text-muted text-xs tracking-wide uppercase">{t(`teacher.studio.${g.labelKey}`)}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {include[g.key].length === 0 && <span className="text-muted text-xs">{t("teacher.studio.noneAvailable")}</span>}
                    {include[g.key].map((v) => {
                      const e = vocabEntry(g.category, v);
                      return (
                        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 ps-2.5 pe-1.5 text-xs">
                          {e?.emoji} {e?.label[locale] ?? v}
                          <button
                            type="button"
                            aria-label={`${t("common.remove")} ${e?.label[locale] ?? v}`}
                            onClick={() => setInclude({ ...include, [g.key]: include[g.key].filter((x) => x !== v) })}
                            className="rounded-full p-0.5 hover:bg-stone-200"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      );
                    })}
                    {options.available[g.key]
                      .filter((v) => !include[g.key].includes(v))
                      .slice(0, 4)
                      .map((v) => {
                        const e = vocabEntry(g.category, v);
                        return (
                          <button
                            key={v}
                            type="button"
                            disabled={include[g.key].length >= g.limit}
                            onClick={() => setInclude({ ...include, [g.key]: [...include[g.key], v] })}
                            className="border-line text-muted rounded-full border border-dashed px-2.5 py-1 text-xs hover:border-stone-400 disabled:opacity-40"
                          >
                            + {e?.label[locale] ?? v}
                          </button>
                        );
                      })}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-muted mt-4 text-xs">{t("teacher.studio.privacy")}</p>
          {usesDemo && (
            <Alert tone="info" className="mt-3">
              {t("teacher.studio.demoNotice")}
            </Alert>
          )}
          <Button className="mt-4 w-full" size="lg" onClick={generate} disabled={!goalId || !options} loading={pending} data-testid="generate">
            <Sparkles className="size-4" />
            {pending ? t("teacher.studio.generating") : t("teacher.studio.generate")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
